# MongoDB Setup

1. Open MongoDB Atlas.
2. Go to your cluster and click Connect.
3. Choose Drivers.
4. Copy the Node.js connection string.
5. Replace `<password>` with your database user password.
6. Paste it in `backend/.env` as `MONGODB_URI`.
7. Open Network Access in Atlas.
8. Click Add IP Address.
9. For testing, choose Allow Access From Anywhere and save `0.0.0.0/0`.
10. Wait 1-2 minutes, then restart the backend.

Correct format:

```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/my-notes?retryWrites=true&w=majority
```

PowerShell temporary env syntax, if needed:

```powershell
$env:MONGODB_URI="mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/my-notes?retryWrites=true&w=majority"
```

Do not use:

```powershell
MONGODB_URI=mongodb+srv://username:password@cluster0
```

That is not valid PowerShell syntax and the URI is incomplete.

If you see this error:

```text
querySrv ECONNREFUSED _mongodb._tcp.cluster0...
```

MongoDB Atlas is not reachable from your machine. Most commonly, your current IP is not allowed in Atlas Network Access, or your network/firewall blocks port `27017`.
