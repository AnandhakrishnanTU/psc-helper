// Vercel serverless function: every /api/* request is routed here (see vercel.json).
// The server is compiled to server/dist during the Vercel build.
export { default } from '../server/dist/app.js'
