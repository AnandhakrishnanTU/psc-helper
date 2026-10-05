import { CONTACT_EMAIL } from '../siteConfig'

export default function AboutPage() {
  return (
    <article className="prose">
      <h2>About PSC Helper</h2>
      <p>PSC Helper is a free tool that helps Kerala PSC aspirants find job notifications they can apply for, without searching the PSC website or newspapers every day.</p>

      <h3>How it works</h3>
      <ol>
        <li>Every 3 hours we read the notifications published on <a href="https://www.keralapsc.gov.in/notifications" target="_blank" rel="noreferrer">keralapsc.gov.in</a>, including addenda, errata and cancellations.</li>
        <li>Qualification and age limit are read from each notification automatically, then checked by a person before the job is shown.</li>
        <li>We compare them with your details and show the jobs that match. Jobs we are not fully sure about are marked "Check in notification".</li>
      </ol>

      <h3 id="disclaimer">Disclaimer</h3>
      <p className="notice">
        PSC Helper is <b>not affiliated with, endorsed by or connected to the Kerala Public Service Commission</b>.
        Information is taken from the official PSC website and may contain errors or be out of date.
        <b> Always read the official notification before applying.</b> Apply only through the official
        Thulasi portal (thulasi.psc.kerala.gov.in). PSC Helper never asks for your PSC login, fees or documents.
      </p>
      <p>Found a mistake? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </article>
  )
}
