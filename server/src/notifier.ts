import nodemailer from 'nodemailer'
import webpush from 'web-push'
import { config } from './config.js'
import { formatDate } from './dates.js'
import { deleteSubscription } from './db.js'
import { log } from './log.js'
import type { Job, Subscription } from './types.js'

const mailer = config.smtp.host && config.smtp.user
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null

const pushEnabled = Boolean(config.vapid.publicKey && config.vapid.privateKey)
if (pushEnabled) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey)

export const vapidPublicKey = config.vapid.publicKey
export const emailEnabled = mailer !== null

const DISCLAIMER = 'PSC Helper is not affiliated with Kerala PSC. Always confirm eligibility in the official notification before applying.'

function escape(text: string) {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const manageUrl = (sub: Subscription) => `${config.appUrl}/manage/${sub.token}`
const unsubscribeUrl = (sub: Subscription) => `${config.appUrl}/unsubscribe?token=${sub.token}`

interface Email {
  to: string
  subject: string
  text: string
  html: string
  unsubscribe?: Subscription
}

export async function sendEmail({ to, subject, text, html, unsubscribe }: Email) {
  if (!mailer) {
    log.warn(`SMTP not configured, email not sent to ${to}: ${subject}`)
    return
  }
  await mailer.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
    // One-click unsubscribe, required by Gmail and Yahoo for bulk senders
    headers: unsubscribe
      ? {
          'List-Unsubscribe': `<${config.appUrl}/api/subscriptions/unsubscribe?token=${unsubscribe.token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : undefined,
  })
}

function layout(body: string, sub?: Subscription) {
  const footer = sub
    ? `<p style="color:#6b7280;font-size:12px"><a href="${manageUrl(sub)}">Change your details</a> · <a href="${unsubscribeUrl(sub)}">Unsubscribe</a><br>${DISCLAIMER}</p>`
    : `<p style="color:#6b7280;font-size:12px">${DISCLAIMER}</p>`
  return `<div style="font-family:system-ui,sans-serif;max-width:600px">${body}<hr>${footer}</div>`
}

function textFooter(sub: Subscription) {
  return `\n\nChange your details: ${manageUrl(sub)}\nUnsubscribe: ${unsubscribeUrl(sub)}\n\n${DISCLAIMER}`
}

function describe(job: Job) {
  return `${job.title}, ${job.department} (Cat. No. ${job.categoryNo}), last date ${formatDate(job.lastDate)}`
}

export async function sendVerificationEmail(sub: Subscription) {
  const link = `${config.appUrl}/verify?token=${sub.verifyToken}`
  await sendEmail({
    to: sub.contact!,
    subject: 'Confirm your PSC Helper job alerts',
    text: `Open this link to start receiving PSC job alerts:\n${link}\n\nIf you did not sign up, ignore this email and nothing will be sent.\n\n${DISCLAIMER}`,
    html: layout(`<p>Click below to start receiving Kerala PSC job alerts.</p>
      <p><a href="${link}" style="background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirm alerts</a></p>
      <p>If you did not sign up, ignore this email and nothing will be sent.</p>`),
  })
}

export async function sendManageLinks(email: string, subs: Subscription[]) {
  const links = subs.map((s, i) => `Alert ${i + 1} (${s.profile.qualification}): ${manageUrl(s)}`)
  await sendEmail({
    to: email,
    subject: 'Your PSC Helper alert links',
    text: `Use these links to change or delete your alerts:\n${links.join('\n')}\n\n${DISCLAIMER}`,
    html: layout(`<p>Use these links to change or delete your alerts:</p><ul>${
      subs.map((s, i) => `<li><a href="${manageUrl(s)}">Alert ${i + 1} (${escape(s.profile.qualification)})</a></li>`).join('')
    }</ul>`),
  })
}

/** Sends a job alert. Returns false if the subscription is dead and was removed. */
export async function sendJobAlert(sub: Subscription, jobs: Job[], title: string): Promise<boolean> {
  if (sub.channel === 'email' && sub.contact) {
    const items = jobs.map(j => `<li style="margin-bottom:8px"><a href="${escape(j.notificationUrl)}">${escape(j.title)}</a><br>
      ${escape(j.department)} · Cat. No. ${escape(j.categoryNo)} · Last date <b>${formatDate(j.lastDate)}</b></li>`).join('')
    await sendEmail({
      to: sub.contact,
      subject: title,
      text: `${title}\n\n${jobs.map(describe).join('\n')}\n\nSee all: ${config.appUrl}${textFooter(sub)}`,
      html: layout(`<p>${escape(title)}</p><ul>${items}</ul><p><a href="${config.appUrl}">Open PSC Helper</a></p>`, sub),
      unsubscribe: sub,
    })
    return true
  }

  if (sub.channel === 'push' && sub.push) {
    if (!pushEnabled) {
      log.warn(`VAPID keys not configured, push not sent: ${title}`)
      return true
    }
    const body = jobs.length === 1 ? describe(jobs[0]) : jobs.map(j => j.title).join(', ')
    try {
      await webpush.sendNotification(sub.push, JSON.stringify({ title, body, url: config.appUrl }), { TTL: 24 * 3600 })
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Browser unsubscribed or app was uninstalled
        deleteSubscription(sub.id)
        log.info(`Removed expired push subscription ${sub.id}`)
        return false
      }
      throw err
    }
    return true
  }
  return true
}

/** Email to the site owner; silently skipped if ADMIN_EMAIL is not set. */
export async function sendAdminEmail(subject: string, lines: string[]) {
  if (!config.adminEmail) {
    log.warn(`ADMIN_EMAIL not set. ${subject}`, lines)
    return
  }
  try {
    await sendEmail({
      to: config.adminEmail,
      subject: `[PSC Helper] ${subject}`,
      text: `${lines.join('\n')}\n\nAdmin: ${config.appUrl}/admin`,
      html: `<div style="font-family:system-ui,sans-serif"><ul>${lines.map(l => `<li>${escape(l)}</li>`).join('')}</ul>
        <p><a href="${config.appUrl}/admin">Open admin page</a></p></div>`,
    })
  } catch (err) {
    log.error('Could not send admin email', err)
  }
}
