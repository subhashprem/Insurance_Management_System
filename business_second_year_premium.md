# Business & Second-Year Premium Feature Requirements

## Overview

Implement a Business (First-Year Premium) and Second-Year Premium tracking system for insurance policies. The system must calculate values at the policy level and automatically aggregate them through the organizational hierarchy.

# Hierarchy Structure

Area Manager (AM) → Senior Sales Manager (SSM) → Sales Manager (SM) → Sales Representative (SR) → Policies

Each policy belongs directly to an SR.

Policy business and premiums roll up: Policy → SR → SM → SSM → Area Manager

# Database Fields

## Issue Date
Policy start date (Year 1).

## Due Date
Annual premium due date.

## Last Paid Date
Most recent payment date.

## Premium Amount
Annual premium value.

# Total Business Logic

Business is counted only once at policy issuance (first premium).

Total Business = sum of all policy premiums.

# Second-Year Premium Logic

Only the second installment is counted. 

Second Premium Due Date = `Due Date + 1 Year`
Upper Bound Date = `Due Date + 2 Years`

A payment counts as the **Second-Year Premium** if and only if the `Last Paid Date` falls within the second-year window:
* `Last Paid Date >= Due Date + 1 Year` AND `Last Paid Date < Due Date + 2 Years`

### Database Condition:
```sql
last_paid_date >= date(due_date, '+1 year')
AND last_paid_date < date(due_date, '+2 year')
```

If the `Last Paid Date` is before this window, or if it is on or after the upper bound (`Due Date + 2 Years`), it is ignored for the second-year premium calculations. **Third-year payments and onward are NOT counted.**

# Hierarchical Aggregation

All values roll up:
SR → SM → SSM → Area Manager

# Final Output

System must calculate:
- **Total Business** (Year 1 premium sum)
- **Second-Year Premium** (Capped to the 2nd-year window)

at all hierarchy levels.
