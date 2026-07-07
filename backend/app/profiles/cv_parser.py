"""CV PDF parser — text extraction plus LLM-powered structured parsing.

Uses ``pdfplumber`` for text extraction and calls an LLM (Ollama native API
or any OpenAI-compatible endpoint) to extract structured profile fields from
the raw text.
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

import httpx

from app.config import settings
from app.profiles.schemas import CVParseResult, ImportedProfile

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# System prompt for structured extraction (works with any LLM).
_EXTRACTION_PROMPT = """You are a CV/resume parser. Extract structured data from the
following CV text and return a JSON object with these fields:
- headline (str or null): The professional headline / current title
- summary (str or null): Professional summary or objective
- skills (list of {"name": str, "level": str}): Technical and professional skills.
  Level must be one of: beginner, intermediate, advanced, expert.
- education (list of {"institution": str, "degree": str, "field": str or null,
  "start_date": str or null, "end_date": str or null}): Formal education only
  (degrees, diplomas from universities/colleges). Do NOT include courses,
  bootcamps, workshops, or certifications here.
- work_experience (list of {"company": str, "role": str, "start_date": str or null,
  "end_date": str or null, "description": str or null, "current": bool}):
  Paid employment, internships, freelance work, and full-time roles only.
  Do NOT include courses, bootcamps, online training, or certifications in
  work_experience.

Return ONLY valid JSON, no markdown formatting, no explanation, no code blocks."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _detect_llm_backend(url: str) -> str:
    """Auto-detect the LLM backend type from the base URL.

    Returns ``"ollama"``, ``"openai"``, or ``"generic"``.
    """
    if "localhost" in url or "127.0.0.1" in url or "ollama" in url:
        return "ollama"
    if "openai" in url.lower() or "api.openai" in url:
        return "openai"
    return "generic"


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CVParser:
    """Parse CV PDF files into structured profile data.

    Two-step process:
    1. ``extract_text()`` — extract raw text via ``pdfplumber``.
    2. ``parse_cv()`` — send text to the configured LLM for structured extraction.

    Supports both the Ollama native API (``/api/chat``) and any OpenAI-compatible
    backend (``/v1/chat/completions``). The backend is auto-detected from the URL.
    """

    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        self._http_client = http_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract_text(self, file_path: str) -> str:
        """Extract all text from a PDF file using ``pdfplumber``.

        Parameters
        ----------
        file_path:
            Absolute or relative path to the PDF file.

        Returns
        -------
        str
            The concatenated text of all pages.

        Raises
        ------
        FileNotFoundError
            If the file does not exist.
        ValueError
            If the PDF is empty or has no extractable text.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        import pdfplumber

        try:
            with pdfplumber.open(file_path) as pdf:
                pages_text = [page.extract_text() for page in pdf.pages]
        except Exception as exc:
            raise ValueError(f"Could not extract text from PDF: {exc}") from exc

        text = "\n".join(filter(None, pages_text)).strip()

        if not text:
            raise ValueError(
                "Could not extract text from PDF: no extractable content found.",
            )

        return text

    async def parse_cv(self, file_path: str) -> CVParseResult:
        """Extract text from a PDF and parse it via the configured LLM.

        Parameters
        ----------
        file_path:
            Path to the PDF file.

        Returns
        -------
        CVParseResult
            Metadata about the file plus the structured parsed data.

        Raises
        ------
        FileNotFoundError
            If the file does not exist.
        ValueError
            If the PDF is empty, has no extractable text, or LLM
            parsing fails.
        """
        text = self.extract_text(file_path)
        if not text:
            raise ValueError("No extractable text found in PDF.")

        path = Path(file_path)
        parsed = await self._parse_with_llm(text)

        return CVParseResult(
            id=str(uuid.uuid4()),
            file_name=path.name,
            file_size=path.stat().st_size,
            parsed_data=parsed,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _parse_with_llm(self, text: str) -> ImportedProfile:
        """Send extracted text to the LLM and parse the structured response.

        Auto-detects the backend (Ollama native vs OpenAI-compatible) from
        ``settings.llm_api_url`` and calls the appropriate endpoint.

        Retries once with a strengthened prompt if the first attempt returns
        malformed JSON.
        """
        backend = _detect_llm_backend(settings.llm_api_url)

        messages = [
            {"role": "system", "content": _EXTRACTION_PROMPT},
            {"role": "user", "content": text},
        ]

        # Retry loop: first attempt, then retry with strengthened prompt if needed
        for attempt in range(2):
            try:
                raw = await self._call_llm(messages, backend)
                if not raw:
                    raise ValueError("Empty response from LLM")
                data = json.loads(raw)
                return ImportedProfile(**data)
            except (json.JSONDecodeError, ValueError, Exception) as exc:
                if attempt == 0:
                    logger.info(
                        "LLM CV parsing attempt 1 failed (%s), retrying "
                        "with strengthened prompt",
                        exc,
                    )
                    messages[0]["content"] = (
                        _EXTRACTION_PROMPT
                        + "\n\nCRITICAL: Respond with raw JSON only. "
                        "No markdown, no code fences, no explanation."
                    )
                    continue
                logger.exception("LLM CV parsing failed after retry")
                raise ValueError(
                    f"Failed to parse CV with LLM ({settings.llm_model}): {exc}",
                ) from exc

        raise ValueError("Unexpected: LLM parsing loop exited without return")

    async def _call_llm(
        self,
        messages: list[dict[str, str]],
        backend: str,
    ) -> str:
        """Dispatch the LLM call to the correct backend."""
        if backend == "ollama":
            return await self._call_ollama(messages)
        return await self._call_openai_compat(messages)

    # ------------------------------------------------------------------
    # Ollama native API  (POST /api/chat)
    # ------------------------------------------------------------------

    async def _call_ollama(self, messages: list[dict[str, str]]) -> str:
        """Call Ollama's native ``/api/chat`` endpoint.

        API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
        """
        client = self._get_http_client()
        base = settings.llm_api_url.rstrip("/")

        # Strip any OpenAI-compatible path suffix — we build our own.
        for suffix in ("/v1/chat/completions", "/v1", "/api"):
            if base.endswith(suffix):
                base = base[: -len(suffix)]
                break

        url = f"{base}/api/chat"
        payload = {
            "model": settings.llm_model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.1},
        }

        resp = await client.post(url, json=payload, timeout=120.0)
        resp.raise_for_status()
        body = resp.json()

        # Response: { "model": "...", "message": { "role": "...", "content": "..." }, "done": true }
        content = body.get("message", {}).get("content", "")
        if not content:
            raise ValueError(f"Ollama returned empty content: {body}")

        # Strip markdown fences if the model wrapped it anyway
        return content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    # ------------------------------------------------------------------
    # OpenAI-compatible endpoint  (POST /v1/chat/completions)
    # ------------------------------------------------------------------

    async def _call_openai_compat(self, messages: list[dict[str, str]]) -> str:
        """Call any OpenAI-compatible ``/v1/chat/completions`` endpoint."""
        client = self._get_http_client()
        url = settings.llm_api_url.rstrip("/")

        payload = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 4096,
        }

        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"}
            if settings.llm_api_key
            else {},
            timeout=120.0,
        )
        resp.raise_for_status()
        body = resp.json()

        content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not content:
            raise ValueError(f"OpenAI endpoint returned empty content: {body}")

        return content.strip()

    # ------------------------------------------------------------------
    # Client factory
    # ------------------------------------------------------------------

    def _get_http_client(self) -> httpx.AsyncClient:
        """Return the HTTP client, creating it lazily if needed."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient()
        return self._http_client
