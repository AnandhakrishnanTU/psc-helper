// Runs one job check immediately. Run: npm run scrape
import { checkForNewJobs } from './scheduler.js'

await checkForNewJobs()
