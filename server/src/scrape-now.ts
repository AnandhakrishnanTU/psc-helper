// Runs one job check immediately. Run: npm run scrape
import { runJobCheck } from './scheduler.js'

console.log(await runJobCheck())
