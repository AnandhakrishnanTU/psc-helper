import nodemailer from 'nodemailer'
import webpush from 'web-push'
import type { Job, Subscription } from './types.js'

const env = process.env
const APP_URL = env.APP_URL ?? 'http://localhost:5173'

const mailer = env.SMTP_HOST && env.SMTP_USER
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT ?? 465),
      secure: Number(env.SMTP_PORT ?? 465) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null

const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT ?? 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
}

export const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? ''

function describe(job: Job) {
  return `${job.title} (Cat. No. ${job.categoryNo}), last date ${job.lastDate}`
}

async function sendEmail(to: string, subject: string, jobs: Job[]) {
  if (!mailer) return console.log(`[email] SMTP not configured, would send to ${to}: ${subject}`)
  const items = jobs.map(j => `<li><a href="${j.notificationUrl}">${describe(j)}</a></li>`).join('')
  await mailer.sendMail({
    from: env.EMAIL_FROM ?? env.SMTP_USER,
    to,
    subject,
    text: jobs.map(describe).join('\n'),
    html: `<p>${subject}</p><ul>${items}</ul><p><a href="${APP_URL}">Open PSC Helper</a></p>`,
  })
}

async function sendPush(sub: webpush.PushSubscription, title: string, jobs: Job[]) {
  if (!pushEnabled) return console.log(`[push] VAPID keys not configured: ${title}`)
  const body = jobs.length === 1 ? describe(jobs[0]) : jobs.map(j => j.title).join(', ')
  await webpush.sendNotification(sub, JSON.stringify({ title, body, url: APP_URL }))
}

export async function notify(sub: Subscription, jobs: Job[], title = `${jobs.length} new PSC job(s) you can apply for`) {
  try {
    if (sub.channel === 'email' && sub.contact) await sendEmail(sub.contact, title, jobs)
    else if (sub.channel === 'push' && sub.push) await sendPush(sub.push, title, jobs)
    // TODO: WhatsApp via WhatsApp Business API (needs Meta approval and paid templates)
    else console.log(`[${sub.channel}] notify ${sub.contact}: ${title}`)
  } catch (err) {
    console.error(`Notification failed for subscription ${sub.id}:`, err)
  }
}
