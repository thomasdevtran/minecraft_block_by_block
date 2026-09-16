<script setup lang="ts">
import { RouterLink } from 'vue-router'
import VisitorCount from '../components/VisitorCount.vue'
import { SITE } from '../lib/site'
</script>

<template>
  <article class="container legal support">
    <p class="muted">Keep the next build coming</p>
    <h1>Support {{ SITE.name }}</h1>
    <p class="intro">Every guide is free to use. If the site helped you make something, you can help {{ SITE.operator.name }} cover hosting and keep improving the guides. There is no obligation, and a contribution does not unlock extra features.</p>
    <div class="summary"><p><strong>Your support goes to an independent creator.</strong> It is not a charitable donation or a payment to Mojang or Microsoft. Contributions are not represented as tax-deductible.</p></div>
    <div class="buttons">
      <a v-if="SITE.support.kofi" :href="SITE.support.kofi" class="btn primary" target="_blank" rel="noopener noreferrer">Support on Ko-fi ↗<span class="visually-hidden"> (opens in a new tab)</span></a>
      <a v-if="SITE.support.paypal" :href="SITE.support.paypal" class="btn" target="_blank" rel="noopener noreferrer">Support on PayPal ↗<span class="visually-hidden"> (opens in a new tab)</span></a>
    </div>
    <p class="muted small">You will leave this site to pay. Check the recipient, amount and payment frequency before confirming.</p>
    <h2>What your support helps with</h2>
    <ul><li>Hosting and the domain.</li><li>Checking cube counts, improving instructions and maintaining the catalog.</li><li>Making the site easier to use on more devices.</li></ul>
    <h2>Help without spending anything</h2>
    <p>Share the site with someone who enjoys making things, or tell us when a guide is unclear. Include the item's name, build style and step number so we can reproduce the issue.</p>
    <p><a :href="`mailto:${SITE.operator.email}`">Email {{ SITE.operator.name }}</a> · <a :href="`${SITE.github}/issues`" target="_blank" rel="noopener noreferrer">Report an issue on GitHub<span class="visually-hidden"> (opens in a new tab)</span></a></p>
    <div class="counter card"><VisitorCount big /><p class="muted small">An approximate total of visitors who allow counting. It is not a verified number of individual people. <RouterLink to="/privacy#visitor-count">Method and privacy choices</RouterLink>.</p></div>
    <h2>Payment questions</h2>
    <p>For an accidental payment, refund request or other payment concern, email <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a>. Provider rules and applicable legal rights still apply. Children should have a parent or guardian handle payments.</p>
    <p class="back-links"><RouterLink to="/terms#payments">Support payment terms</RouterLink> · <RouterLink to="/privacy">Privacy</RouterLink> · <RouterLink to="/">Back to builds</RouterLink></p>
  </article>
</template>

<style scoped>
.buttons { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0 12px; }
.counter { padding: 24px; margin: 28px 0; }
.counter p { margin: 12px 0 0; }
.small { font-size: 0.9rem; }
@media (max-width: 480px) { .buttons .btn { width: 100%; } }
</style>
