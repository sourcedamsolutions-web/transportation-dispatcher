# Transportation Dispatcher (MVP v1.2) – Route Roster Wired

### What’s new in v1.2
- Loads the full Route Roster from the uploaded inventory PDF (seeded into Postgres)
- Day Sheet auto-lists ALL routes (Z500+ and Z560+ plus A-variants)
- Default AM 1st cell is prefilled with the assigned Driver/Assistant from inventory (or OPEN)

## Deploy Update (GitHub + Render)
1. In GitHub repo `sourcedamsolutions-web/transportation-dispatcher`, upload/overwrite these from this package:
   - `package.json`
   - `client/`
   - `server/`
2. In Render Web Service, click **Manual Deploy → Deploy latest commit**.

## Required Render Environment Variables
- APP_NAME = Transportation Dispatcher
- JWT_SECRET = (Generate)
- ADMIN_NAME = Ray
- ADMIN_PIN = 619511
- DATABASE_URL = (Render Postgres Internal URL)

## Login
Name: Ray
PIN: 619511


## v1.2.1
- Layout lock (v1.2) + server stability fix (no single-quote SQL bug)


## v1.3.0
- Roster Board: section headers, cleaned Notified UI, print paging (Drivers/Assistants, 28 rows/page)
- Added scaffold tabs: Day Sheet + Call-Outs for next iteration
