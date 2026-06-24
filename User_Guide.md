# User Operations Guide
## Insurance Policy Records Management System

Welcome to the **Insurance Policy Records Management System**. This operations guide provides instructions on how to use, manage, and maintain the software.

---

## 📂 Table of Contents
1. [System Introduction](#1-system-introduction)
2. [Getting Started & Login](#2-getting-started--login)
3. [Input Validation & Hotkeys](#3-input-validation--hotkeys)
4. [The Executive Dashboard](#4-the-executive-dashboard)
5. [Managing the Sales Organization Hierarchy](#5-managing-the-sales-organization-hierarchy)
6. [Client & Proposal Registration](#6-client--proposal-registration)
7. [Policy Management & Premium Calculations](#7-policy-management--premium-calculations)
8. [Analytics & Generating Reports](#8-analytics--generating-reports)
9. [Data Backup, Restore, and System Reset](#9-data-backup-restore-and-system-reset)
10. [Licensing & Renewal Workflow](#10-licensing--renewal-workflow)

---

## 1. System Introduction

**Insurance Policy Records Management System** is a secure, desktop-based application designed to streamline the operations of insurance teams. It handles proposer records, policy lifecycle tracking, hierarchical sales performance, and automatic premium computations. 

The software runs as a standalone desktop application on **Windows** and **macOS**, executing all calculations and storing data locally in an encrypted database for complete offline security.

---

## 2. Getting Started & Login

When you launch the application, you will be presented with a secure login page. The system enforces Role-Based Access Control (RBAC) to ensure that operators only see the options appropriate for their role.

### 🔑 Login Credentials

The system seeds default profiles on the first installation:

| User Role | Default Username | Default Password | Description |
| :--- | :--- | :--- | :--- |
| **Developer** | `developer` | `Dev@1234` | Full system access, including Developer Operations (Database Reset, App Packaging). |
| **Admin** | `admin` | `Admin@1234` | Core business operations (Dashboard, Policies, Proposals, Team Recruitment, Reports). |

> [!TIP]
> You can update credentials or add new operators by logging in and navigating to the **Users** management section.
>
> If you find yourself unable to type in the input fields after a database reset or page reload, ensure that you click directly inside the text box. The input fields are fully optimized with selection overrides to keep them responsive.

---

## 3. Input Validation & Hotkeys

To keep your policy records clean, standard, and secure, the system enforces real-time formatting as you type, followed by complete validations prior to saving.

### 📋 Live Form Formatters & Validations

1. **CNIC Fields**:
   * **Formatting**: Auto-formats to `XXXXX-XXXXXXX-X`. Blocks any non-digit keys during typing.
   * **Rule**: Must contain exactly 13 digits.
2. **Phone Fields**:
   * **Rule**: Restricted to 11 or 12 digits. Non-digit keys, spaces, and `+` symbols are blocked during entry.
3. **Date Fields**:
   * **Formatting**: Auto-formats to `DD/MM/YYYY` (adds slashes dynamically). Letters and symbols are blocked.
   * **Rule**: Checks for valid dates, blocks future dates of birth, and limits ages between 0 and 120 years.
4. **Name Fields**:
   * **Rule**: Allows only alphabets, spaces, dots `.`, and hyphens `-`. Numbers and other special characters are blocked.
5. **Code Fields**:
   * **Rule**: Uppercase only. Restricts typing to uppercase letters, numbers, hyphens `-`, and underscores `_`.
6. **Premium & Amounts**:
   * **Rule**: Positive numbers only. Permits decimals up to 2 places. Commas are blocked.
7. **Clean Space Trimming**:
   * All forms automatically trim leading and trailing spaces, and reduce double spaces inside text fields to a single space before saving.

> [!WARNING]
> If a validation fails on save, the system blocks the database commit, overlays red borders on the invalid fields, displays an error message, and automatically focuses your keyboard cursor on the first invalid field.

### ⌨️ Keyboard Navigation Shortcuts

You can drive operations much faster by using these hardware shortcut bindings:

#### 1. F1–F12 Sidebar Page Navigation
Press these keys to switch screens instantly:
* **F1**: Dashboard
* **F2**: Proposer Register
* **F3**: Policy Register
* **F4**: SR Recruitment
* **F5**: SM Recruitment
* **F6**: SSM Recruitment
* **F7**: Area Manager
* **F8**: Show Team
* **F9**: Business Figure
* **F10**: Notifications
* **F11**: Settings
* **F12**: Users (developer only)

#### 2. Ctrl + N Context-Aware Modals
* Press **Ctrl + N** on any of the management screens (F2 through F7) to immediately trigger and pop open the "Add New" creation form overlay.

---

## 4. The Executive Dashboard

Upon logging in, the **Executive Dashboard** provides an immediate overview of business metrics.

```
+----------------------------------------------------------------------------+
|  [Active Policies]       [Total Business]       [Second-Year Premium]      |
|       Count: 142             2,450,000                 840,000             |
+----------------------------------------------------------------------------+
```

### 📊 Dashboard Widgets:
1. **KPI Metric Cards**:
   * **Active Policies**: The count of all currently active policies.
   * **Total Business**: The sum of all registered policy premiums (First-Year Premium collections).
   * **Second-Year Premium**: The aggregated second-year premiums collected (based on the payment window).
2. **Performance Charts**: Dynamic visual representations of target margins vs. actual sales metrics, separated by role tiers.
3. **Anniversary Warning Panel**: Located on the right or top, this panel flags policies that are approaching their renewal dates (within 30 days of the due date), alerting you to follow up for second-year premium collection.

---

## 5. Managing the Sales Organization Hierarchy

Nexus ERP models the standard hierarchical structure of an insurance sales force:

$$\text{Area Manager (AM)} \longrightarrow \text{Senior Sales Manager (SSM)} \longrightarrow \text{Sales Manager (SM)} \longrightarrow \text{Sales Representative (SR)}$$

All sales performances, policy details, and premium totals roll up through this chain.

### 📋 Tier Recruitment Sheets

Dedicated recruitment modules allow you to add, edit, and audit personnel:
* **Area Manager (AM)**
* **SSM Recruitment**
* **SM Recruitment**
* **SR Recruitment**

### 👤 Profile Form Fields

When registering or updating personnel, fill in the following details:
1. **Personnel Codes**: Unique identifiers (e.g., `AM-001`, `SR-2026`) used to establish hierarchy links.
2. **Name**: Full name of the agent.
3. **Son/Daughter/Wife of**: Text field to capture client or agent relationship details.
4. **CNIC & Contact Details**: National identity card numbers, active addresses, and primary/secondary phone numbers.
5. **Registration Info**: Enter the **Registration No** and **Registration Date** issued to the agent.
6. **Status**: Toggle between `Active` or `Inactive`.
7. **Documents Upload**:
   * Upload scans of CNICs (Front and Back), matriculation/intermediate/degree certificates.
   * Upload a **Passport Size Picture** for identification records.

### 🌳 Show Team (Interactive Structure Map)
* Navigate to the **Show Team** page.
* Select an Area Manager or Senior Sales Manager to view their entire reporting tree (AM ➜ SSM ➜ SM ➜ SR).
* The tree displays reporting structure, registration status, and codes for quick visual audit.

---

## 6. Client & Proposal Registration

Before issuing a policy, you register the client details and their initial insurance proposal.

### 1. Proposer Register
* Stores profiles of the clients (policyholders).
* Tracks name, address, CNIC, and contact information.

### 2. Proposal Register
* Create a proposal by filling out the proposal form.
* **Fields**: Proposal Number, Client Name, Premium Amount, PR Number, PR Date, Payment Type (Cash/Cheque), and Status.
* Select the **SR Code** of the agent who secured the proposal. The system will automatically populate the respective SM and SSM codes based on the team hierarchy.
* **Conversion**: Once a proposal is approved and issued, click **Convert** to automatically copy the details into the **Policy Register** without manual re-entry.

---

## 7. Policy Management & Premium Calculations

The **Policy Register** is the primary module for managing live insurance plans.

### 📅 Managing Key Date Fields

Calculations are driven by three date fields:
* **Issue Date**: The date the policy is officially issued (Year 1).
* **Due Date**: The annual renewal date.
* **Last Paid Date**: The date the client made their most recent premium payment.

> [!IMPORTANT]
> To ensure consistent formatting across exports and data views, all dates are displayed in the **`dd/mm/yyyy`** format. When inputting dates manually, use the date picker or input in `dd/mm/yyyy` format.

### 🧮 Understanding Business Calculations

The system automatically performs calculations based on these formulas:

#### 1. Total Business
* **What it represents**: First-year premium collections.
* **Formula**: The sum of the `Premium` values for all policies registered under an agent.
* **Rollup**: Directly aggregates upward: Policy ➜ SR ➜ SM ➜ SSM ➜ AM.

#### 2. Second-Year Premium
* **What it represents**: Renewal payments made for the second year.
* **Formula**: The premium amount is counted if and only if the `Last Paid Date` falls within the second-year window:
  $$\text{Due Date} + 1 \text{ Year} \le \text{Last Paid Date} < \text{Due Date} + 2 \text{ Years}$$
* **Capping Rule**: If a payment's `Last Paid Date` is equal to or greater than `Due Date + 2 Years`, it is classified as a third-year payment or beyond and is **automatically excluded** from the second-year metrics.

---

## 8. Analytics & Generating Reports

Nexus ERP provides advanced analytics and sharing tools.

### 📈 Business Figures View
* Provides granular breakdowns of sales performance against set target margins.
* Displays figures dynamically filtered by Area Manager, SSM, SM, or SR.

### 🖨 Exporting Data
1. **PDF Export**:
   * Click **Export PDF** on the Dashboard or Business Figures view.
   * Generates a clean, formatted document containing performance charts and summaries, centered with custom report headers.
2. **Excel Export**:
   * Click **Export Excel** in any register table view.
   * Generates a spreadsheet containing **all columns** visible on the screen for deep auditing.

---

## 9. Data Backup, Restore, and System Reset

Maintain data integrity using the utilities found in **Settings** under the **Developer System Operations** block:

### 💾 Database Backup
* Generates a compressed, timestamped ZIP archive containing the SQLite database and state configs.
* Save this file to an external hard drive, cloud storage, or backup directory.

### 🔄 Database Restore
* Select a previously generated ZIP backup file.
* The system will safely terminate the database locks, extract the file, and swap the databases instantly without requiring an application restart.

### 🧹 Database Reset
* Wipes all transactional data (policies, proposals, managers, agents, notifications).
* **Important**: It **preserves your registered operator credentials** (Admin, Developer user accounts) so that you do not get locked out of the software.

---

## 10. Licensing & Renewal Workflow

To protect the software from unauthorized redistribution, Nexus ERP uses a secure, machine-bound licensing model.

### 🕒 Expiration & Security Safeguards

1. **3-Day Trial Version**:
   * A clean installation begins as a 3-day Trial. The countdown triggers strictly upon the first successful login of any administrative or operator profile.
2. **System Clock Tampering Lockout**:
   * If the host computer's system clock is rolled back/manipulated backwards by more than 5 minutes, the application suspends workspace access and displays a fullscreen alert: *"System date manipulation detected. Please correct your system date."* Correcting the clock resolves this block instantly.
3. **Multi-Location Redundant Backups**:
   * Licensing configuration is dynamically synchronized between (1) AppData, (2) User Home directory settings, and (3) the local SQLite Database `Config` table. If files are deleted or tampered with, they are auto-healed from the remaining location backups.
4. **Carry-Forward Expiry Renewal**:
   * When you renew or upgrade the license before the current key expires, any remaining active days are added onto your new license length (carried forward) instead of being lost.

### 🕒 Expiration Warnings & Lockout
* **Warning Banner**: When the remaining active license falls to 30 days or less, a top banner shows the countdown to keep you informed.
* **Expiration Lock**: When remaining days reach 0, the main interface is locked out and replaced by a fullscreen **License Expiration** page.

### 🔄 License Renewal Steps

```mermaid
graph TD
    A[License Expires / Lock Screen Appears] --> B[Copy Unique Machine ID from screen]
    B --> C[Send Machine ID to Lalwani Software Solutions]
    C --> D[Developer generates Activation Key with custom duration/type]
    D --> E[Paste Activation Key in input box]
    E --> F[Click Activate License]
    F --> G[System validates key, carries forward remaining days & unlocks]
```
> Note: Standard user support is detailed below.

1. **Copy the Machine ID**: Click the **Copy** button next to the **Unique Machine ID** on the renewal screen.
2. **Request Activation**: Send the copied ID to Lalwani Software Solutions via the settings contact card or support channels.
3. **Apply Key**: Once you receive the cryptographically signed key, paste it into the **Renewal Key** text field and click **Activate License**.

---

### 📞 Developer & Support Contacts

For any questions, system upgrades, or license keys, contact:

* **Subhash Prem (Software Engineer and Full Stack Developer)**
  * **Phone**: 0333-7104578 / 0315-2967527
  * **Email**: subhashprem4@gmail.com

---
*Nexus ERP is a product of Lalwani Software Solutions. All rights reserved.*
