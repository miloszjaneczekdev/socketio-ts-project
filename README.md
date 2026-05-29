# Guess The Code

Socket.IO game with a React/Vite client, an Express Socket.IO server, and shared TypeScript contracts.

## Structure

- `client/` - React app built with Vite.
- `server/` - Express and Socket.IO backend.
- `shared/` - TypeScript types shared by the app.

## Development

Install dependencies in both packages:

```bash
npm install --prefix client
npm install --prefix server
```

Run the server:

```bash
npm --prefix server run dev
```

Run the client:

```bash
npm --prefix client run dev
```

In development, the Vite client proxies `/socket.io` to the server on `http://localhost:3000/`.
Open the client from other devices through the computer's LAN IP, for example `http://192.168.x.x:5173`, not `localhost`.

## Checks

```bash
npm --prefix server run typecheck
npm --prefix client run build
npm --prefix client run lint
```
