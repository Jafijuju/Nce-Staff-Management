NCE STAFF MANAGEMENT — OWN SERVER

1) Install Node.js 18+ on the server/laptop.
2) Put this folder on the server.
3) Open a terminal in this folder.
4) Run: npm start
5) Open: http://localhost:3000
6) From another phone/PC on the same network use:
   http://SERVER-IP:3000

The database is stored in:
   data/nce_state.json

The database starts EMPTY. No sample staff/user details are included.
On the first screen, click "Create First Administrator" and create your own admin account.
Then use Staff > Users to add users and Staff List > Add Staff to add employees.

Firebase and Supabase are NOT required.

IMPORTANT: The JSON database is suitable for a simple own-server deployment.
For internet-facing production use, add HTTPS, firewall rules and regular backups.
