## VKR Dashboards

Sales, Purchase, Stock and HR dashboards for ERPNext / Frappe HR v16. Each dashboard has a **From / To date** filter, quick ranges (This month, Last month, This quarter, Year to date, Last 12 months) and an optional **Company** filter; the choice is remembered per dashboard. Every KPI shows the change against the previous period of the same length.

| Dashboard | Route | KPIs | Charts | Tables |
|---|---|---|---|---|
| Sales | `/desk/sales-dashboard` | Net sales, invoices, average invoice, unpaid from period, orders booked, collected, new customers | Sales vs orders over time, top customers, sales by territory | Best-selling items, overdue invoices |
| Purchase | `/desk/purchase-dashboard` | Net purchases, supplier invoices, unpaid from period, orders placed, paid to suppliers | Purchases vs orders over time, top suppliers, spend by item group | Most purchased items, orders waiting for delivery |
| Stock | `/desk/stock-dashboard` | Stock value today, value received, value issued, below reorder level, stock entries | Received vs issued over time, value by warehouse, entries by purpose | Fastest-moving items, below reorder level |
| HR | `/desk/hr-dashboard` | Headcount, joined, left, attrition %, leave days, attendance rate | Joiners and leavers, headcount by department, leave days by type, attendance by status | New joiners |

- Days up to 45 → daily buckets; longer ranges → monthly.
- Figures use company currency (base amounts) of submitted documents; returns are netted.
- Permissions: each section is shown only if the user can read its DocType; hidden sections are listed at the top. Pages are limited to the matching roles (Sales / Purchase / Stock / HR users and managers, Accounts, System Manager).
- Navigation (v16 module-first desk): the app ships a **VKR Dashboards** sidebar (`vkr_dashboards/vkr_dashboards/sidebar/`) so it gets its own shell in the dock, with Home (the **Dashboards** workspace) and the four dashboards. On sites still using the Desktop Icons grid, Frappe creates the icon automatically on install.
- Requires ERPNext v16. Frappe HR is optional — without it the HR dashboard shows Employee figures only.

### Install

```bash
cd ~/frappe-bench
cp -r vkr_dashboards apps/          # or: bench get-app <git-url>
./env/bin/pip install -e apps/vkr_dashboards
bench --site <site> install-app vkr_dashboards   # existing install: bench --site <site> migrate
bench build --app vkr_dashboards
bench --site <site> clear-cache && bench restart
```
