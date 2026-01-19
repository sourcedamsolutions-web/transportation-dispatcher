# Transportation Dispatcher (MVP v1.0) – Deploy

## Render (GitHub)
1. Upload **all files/folders** from this package to your GitHub repo (NOT the zip).
2. In Render: New → Web Service → select your repo.
3. Set:
   - Language: Node
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. Render Environment vars:
   - `APP_NAME` = Transportation Dispatcher
   - `JWT_SECRET` = (Generate)
   - `ADMIN_NAME` = Ray
   - `ADMIN_PIN` = 619511
   - `DATABASE_URL` = (paste Render Postgres Internal URL)
5. Deploy.

## First Login
Name: Ray
PIN: 619511
