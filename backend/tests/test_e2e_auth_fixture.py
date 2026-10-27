"""Isolated checks for the browser authentication fixture; no live services needed."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from conftest import _authenticate_browser


@pytest.mark.parametrize(
    ("login_status", "register_status", "expected_error"),
    [
        (200, None, None),
        (401, 201, None),
        (429, None, "E2E login failed: HTTP 429"),
        (401, 409, "E2E registration failed: HTTP 409"),
    ],
)
async def test_browser_authentication_uses_shared_request_context(
    login_status: int, register_status: int | None, expected_error: str | None
) -> None:
    responses = [SimpleNamespace(status=login_status)]
    if register_status is not None:
        responses.append(SimpleNamespace(status=register_status))
    request = SimpleNamespace(post=AsyncMock(side_effect=responses))
    context = SimpleNamespace(
        request=request,
        cookies=AsyncMock(return_value=[{"name": "access_token", "httpOnly": True}]),
    )
    page = SimpleNamespace(context=context, goto=AsyncMock())

    if expected_error:
        with pytest.raises(AssertionError) as failure:
            await _authenticate_browser(page, "http://localhost:8000/api")
        assert str(failure.value).splitlines()[0] == expected_error
        context.cookies.assert_not_awaited()
    else:
        await _authenticate_browser(page, "http://localhost:8000/api")
        context.cookies.assert_awaited_once_with("http://localhost:8000/api")

    assert request.post.await_count == (2 if login_status == 401 else 1)
    assert request.post.await_args_list[0].args[0] == "http://localhost:8000/api/auth/login"
    if login_status == 401:
        assert request.post.await_args_list[1].args[0] == "http://localhost:8000/api/auth/register"
        assert request.post.await_args_list[1].kwargs["data"]["password"] == "Testpass123"
    page.goto.assert_not_awaited()


async def test_browser_authentication_rejects_missing_cookie() -> None:
    request = SimpleNamespace(post=AsyncMock(return_value=SimpleNamespace(status=200)))
    context = SimpleNamespace(request=request, cookies=AsyncMock(return_value=[]))
    page = SimpleNamespace(context=context)

    with pytest.raises(AssertionError, match="access_token cookie"):
        await _authenticate_browser(page, "http://localhost:8000/api")
