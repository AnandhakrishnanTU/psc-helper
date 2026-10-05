import { Link } from 'react-router-dom'
import { CONTACT_EMAIL } from '../siteConfig'

export default function PrivacyPage() {
  return (
    <article className="prose">
      <h2>Privacy policy</h2>
      <p className="muted">Last updated: October 2026</p>

      <h3>What we collect and why</h3>
      <ul>
        <li><b>Job search:</b> your qualification, subject, date of birth and community are sent to our server only to find matching jobs. They are <b>not stored</b> on the server. Your browser remembers them on your own device so you don't have to type them again.</li>
        <li><b>Job alerts:</b> if you turn on alerts, we store those same details plus either your <b>email address</b> or a <b>notification address</b> created by your browser. We use them only to send you alerts about Kerala PSC jobs you may be eligible for.</li>
        <li><b>Community</b> is optional. It is used only for age relaxation and community-reserved (NCA) posts.</li>
      </ul>
      <p>We do not sell or share your data, show ads, or use tracking or analytics cookies.</p>

      <h3>Where it is kept</h3>
      <p>Data is stored in a database run by Supabase (in Mumbai, India) and the app runs on Vercel. Emails are delivered through an email delivery service and phone notifications through your browser's notification service (Google, Apple, Mozilla or Microsoft). These services only receive what is needed to deliver the message.</p>

      <h3>How long we keep it</h3>
      <ul>
        <li>Until you unsubscribe or delete your alert. Deleting removes it immediately.</li>
        <li>Email sign-ups that are not confirmed within 48 hours are deleted automatically.</li>
        <li>Phone notification sign-ups are deleted when your browser tells us notifications were turned off.</li>
        <li>Backup copies of the database are kept for at most 30 days, then deleted.</li>
      </ul>

      <h3>Your rights</h3>
      <p>Under India's Digital Personal Data Protection Act, 2023, you can see, correct and delete your data at any time from the <Link to="/manage">Manage alerts</Link> page, or by using the links in any alert email. Alerts are meant for people aged 18 or over.</p>

      <h3>Contact</h3>
      <p>For questions or complaints about your data, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We reply within 7 days.</p>
    </article>
  )
}
