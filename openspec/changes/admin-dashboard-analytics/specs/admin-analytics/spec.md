# Admin Analytics Specification

## Purpose

Provide system-wide analytics aggregation endpoints and a dashboard page for operators to monitor pipeline health, portal performance, and application conversion rates.

## Requirements

### Requirement: Analytics Aggregation Endpoint

The system MUST expose a `GET /admin/analytics` endpoint that returns aggregated metrics for pipeline runs, job scraping, applications, and portal performance. The endpoint MUST accept a `window` query parameter with values `7d`, `30d`, or `90d` (default: `30d`).

#### Scenario: Successful analytics retrieval

- GIVEN an authenticated admin user
- WHEN the admin requests GET /admin/analytics?window=30d
- THEN the system returns a JSON response with all metric sections (pipeline, jobs, applications, portals, conversion)

#### Scenario: Invalid window parameter

- GIVEN an authenticated admin user
- WHEN the admin requests GET /admin/analytics?window=invalid
- THEN the system MUST return 400 with a message indicating valid window values

### Requirement: Pipeline Success Rate Metric

The system MUST calculate and return pipeline success rate as the percentage of completed pipeline runs over the selected time window.

#### Scenario: Pipeline rate calculation

- GIVEN 80 successful and 20 failed pipeline runs in the last 7 days
- WHEN the admin requests analytics with window=7d
- THEN the response includes pipeline.success_rate of 80.0 and pipeline.total_runs of 100

#### Scenario: No pipeline data in window

- GIVEN no pipeline runs exist in the selected time window
- WHEN the admin requests analytics
- THEN the response includes pipeline.success_rate of 0 and pipeline.total_runs of 0

### Requirement: Portal Time-Series Metric

The system MUST return time-series data for jobs scraped per portal, grouped by day using PostgreSQL `date_trunc`.

#### Scenario: Portal time-series with data

- GIVEN jobs scraped from LinkedIn and Indeed over the last 7 days
- WHEN the admin requests analytics with window=7d
- THEN the response includes a jobs_by_portal array with daily counts per portal

### Requirement: Applications Time-Series Metric

The system MUST return time-series data for applications submitted per day over the selected window.

#### Scenario: Applications time-series

- GIVEN 15 applications submitted across the last 30 days
- WHEN the admin requests analytics with window=30d
- THEN the response includes an applications_timeseries array with daily application counts

### Requirement: Conversion Rate Metric

The system MUST calculate conversion rate as applications submitted divided by pipeline runs completed, expressed as a percentage.

#### Scenario: Conversion rate calculation

- GIVEN 50 completed pipeline runs and 30 applications submitted in the window
- WHEN the admin requests analytics
- THEN the response includes conversion_rate of 60.0

### Requirement: Portal Performance Stats

The system MUST return per-portal performance stats including jobs found, applications submitted, and success rate.

#### Scenario: Multi-portal performance

- GIVEN LinkedIn with 100 jobs and 40 applications, Indeed with 80 jobs and 20 applications
- WHEN the admin requests analytics
- THEN the response includes a portals array with per-portal stats for each portal

### Requirement: Admin Analytics Frontend

The system MUST display an admin dashboard page at `/admin` with overview cards (total pipeline runs, success rate, total applications, conversion rate), time-series charts via Recharts, and portal performance comparison.

#### Scenario: Admin views dashboard

- GIVEN an authenticated admin user
- WHEN the admin navigates to /admin
- THEN the page renders overview stat cards and Recharts visualizations for time-series and portal comparison

#### Scenario: Non-admin blocked from dashboard

- GIVEN an authenticated non-admin user
- WHEN the user navigates to /admin
- THEN the system redirects to the main dashboard
