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

By default the client connects to `http://localhost:3000/`, and the server listens on port `3000`.

## Checks

```bash
npm --prefix server run typecheck
npm --prefix client run build
npm --prefix client run lint
```
