<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { SITE } from '../lib/site'
import { currentSkin } from '../lib/skinStore'
import { clearBuildData } from '../lib/storage'
import { look } from '../lib/look'

const confirming = ref(false)
const cleared = ref('')
function eraseBuilds() {
  const success = clearBuildData()
  if (success) {
    currentSkin.value = null
    look.value = 'current'
  }
  cleared.value = success ? 'Saved skins, settings and build progress were removed from this browser.' : 'Browser storage could not be cleared. Use your browser’s site-data settings instead.'
  confirming.value = false
}
</script>

<template>
  <article class="container legal">
    <p class="eyebrow muted">Your data, your choices</p>
    <h1>Privacy &amp; cookies</h1>
    <p class="muted">Last updated {{ SITE.legalUpdated }}.</p>
    <p class="intro">{{ SITE.name }} is an independent craft-guide site operated by {{ SITE.operator.name }} in {{ SITE.operator.country }}. Contact <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a> for privacy questions or requests.</p>
    <div class="summary">
      <p><strong>No account required. Uploaded skins stay on your device.</strong></p>
      <p>There are no advertising scripts at launch. Page visits are counted automatically without cookies or stored visitor identifiers. Hosting, player lookups and payment services still process data as described below.</p>
    </div>
    <nav class="contents" aria-label="Privacy topics"><a href="#local-data">Saved builds</a><a href="#visitor-count">Visitor count</a><a href="#services">Service providers</a><a href="#rights">Your rights</a></nav>

    <h2 id="local-data">What stays in your browser</h2>
    <p>The site uses local storage to remember the features you use: paint and build settings, your place in a guide, your texture choice, and your last skin image and its username or file label. Your appearance choice is also saved. The application does not set cookies.</p>
    <p>These records stay until you clear them or your browser removes them. Someone using the same browser profile could see them. Uploaded PNG files are processed locally and are not uploaded to our server. Saved builds are not synced or backed up by us.</p>
    <div class="card data-controls">
      <strong>Manage saved builds</strong>
      <p>Remove the saved skin, build settings and progress from this browser.</p>
      <button v-if="!confirming" class="btn" @click="confirming = true">Clear saved build data</button>
      <div v-else>
        <p><strong>This removes your local progress and cannot be undone.</strong></p>
        <div class="button-row"><button class="btn" @click="confirming = false">Keep my data</button><button class="btn" @click="eraseBuilds">Delete saved builds</button></div>
      </div>
      <p v-if="cleared" role="status">{{ cleared }}</p>
    </div>

    <h2 id="visitor-count">Page visits</h2>
    <p>Your browser automatically sends one count request when you open or reload the site. Moving between guides without reloading does not add another visit. Repeat visits count again, so the total measures page visits, not unique people.</p>
    <p>The server increments a single total in Upstash Redis. The counter does not store IP addresses, browser identifiers, pseudonymous codes, timestamps for individual visits, or page history. It does not set cookies, save a counting preference, track clicks or advertising interests, or load Vercel Web Analytics. The server checks the browser user-agent to filter common bots; hosting and infrastructure providers may separately retain request or service logs.</p>
    <p>We honor Global Privacy Control and Do Not Track signals by skipping the count. Blockers, failed requests and bot filtering can also exclude visits, and automated requests can inflate the total. Public totals may take a few minutes to update and are available at <a href="/api/stats">/api/stats</a>. The aggregate is retained while the counter is in use and cannot be linked back to a particular visitor.</p>

    <h2 id="services">Hosting and player lookups</h2>
    <p>The deployment is configured for Vercel hosting. Requests expose technical data such as your IP address, browser, requested URL and time to the hosting provider for delivery, security and troubleshooting. A player username appears in the lookup URL and may appear in request logs. The application does not intentionally write those details into its own database.</p>
    <p>When you request a player's skin, our server sends the username to Mojang and downloads the skin from Minecraft's texture service. Successful responses can be cached at the hosting edge for one hour and served stale for up to a further day while refreshed. This is different from uploading your own file, which stays local.</p>
    <p>Providers may process data outside your country. Log and backup retention depends on the service and deployment settings; contact us for details about a specific request. Essential delivery and security processing supports providing the service and preventing abuse, relying on legitimate interests where that basis applies.</p>
    <ul>
      <li><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel privacy policy</a> — hosting and technical requests.</li>
      <li><a href="https://upstash.com/trust/privacy.pdf" target="_blank" rel="noopener noreferrer">Upstash privacy policy</a> — the aggregate counter when configured.</li>
      <li><a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer">Microsoft privacy statement</a> — Minecraft player lookups.</li>
    </ul>

    <h2>Support payments and contact</h2>
    <p>Ko-fi and PayPal are external links, not embedded payment widgets. Visiting them is your choice and their policies apply. We do not receive card numbers or banking credentials through this site. The recipient may receive transaction information such as your name, email, amount or message, depending on the provider and your settings.</p>
    <p>If you email us, we receive your address and the information you send. We use it to answer your request and retain correspondence and payment records as needed for that purpose and applicable recordkeeping obligations. Do not send passwords or unnecessary personal information.</p>
    <p><a href="https://ko-fi.com/home/privacy" target="_blank" rel="noopener noreferrer">Ko-fi privacy policy</a> · <a href="https://www.paypal.com/us/legalhub/paypal/privacy-full" target="_blank" rel="noopener noreferrer">PayPal privacy statement</a></p>

    <h2>Children and families</h2>
    <p>There are no accounts, public uploads, chat features or behavioral advertising here. Children should use the craft guides with an adult, and should not send personal information or payments. A parent or guardian can contact us about information a child may have provided. Visit counting is limited to aggregate service measurement and is not used to contact or profile children.</p>

    <h2 id="rights">Your rights and choices</h2>
    <p>We do not sell personal information or share it for cross-context behavioral advertising. Depending on your location and the laws that apply, you may have rights to access, correct, delete or receive personal information, restrict or object to processing, withdraw consent, or complain to a privacy regulator. We do not deny access to guides for exercising privacy choices.</p>
    <p>Email <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a> to make a request, including a parent or guardian request. We may need enough information to verify the request. Some information, such as an aggregate counter, cannot be linked back to a particular person; other records, such as correspondence, may be identifiable. Legal retention requirements and other exceptions may apply.</p>

    <h2>Changes to this notice</h2>
    <p>The date above changes when this notice is updated. Before introducing advertising or materially different data processing, we will update these disclosures and implement any required choices or consent.</p>
    <p class="back-links"><RouterLink to="/terms">Terms of use</RouterLink> · <RouterLink to="/">Back to builds</RouterLink></p>
  </article>
</template>

<style scoped>
.data-controls { padding: 20px; margin: 20px 0; }
.data-controls p { margin: 8px 0 16px; }
.button-row { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
