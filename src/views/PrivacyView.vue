<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SITE } from '../lib/site'
</script>

<template>
  <article class="container legal">
    <h1>Privacy &amp; cookies</h1>
    <p class="muted">Last updated {{ SITE.legalUpdated }}.</p>

    <p>
      {{ SITE.name }} is a free fan site run by {{ SITE.operator.name }}. There are no accounts, no ads and no
      analytics. We don't sell anything and we don't build profiles of visitors.
    </p>

    <h2>Cookies</h2>
    <p>
      This site sets no cookies, so there is no cookie banner to click. It does save a few settings in your browser's
      local storage, which stays on your device and is never sent to us:
    </p>
    <ul>
      <li>Your build settings: paint colors, 2D or 3D, old or new textures, hollow blocks and arm style.</li>
      <li>Which step you're on in a guide, so you can come back to it later.</li>
      <li>The last skin you looked up or uploaded, saved as an image so the guide still works after a refresh.</li>
    </ul>
    <p>
      Clearing your browsing data for this site removes all of it. Nothing there identifies you, and we can't read it.
    </p>

    <h2>Skins you build</h2>
    <p>
      <strong>Uploaded skin files never leave your device.</strong> The picture is read and turned into building steps
      by your own browser.
    </p>
    <p>
      When you look up a player by username, that username is sent to our server, which asks Mojang's public
      <span class="nowrap">skin API</span> for that player's skin and passes the picture back to you. We don't store the
      username or the skin. Mojang receives the request and handles it under
      <a href="https://www.minecraft.net/en-us/privacy" target="_blank" rel="noopener noreferrer">their privacy policy</a>.
    </p>

    <h2>Server logs</h2>
    <p>
      Like most websites, the hosting provider keeps short-term technical logs of requests, which usually include the IP
      address, time and page. They're used to keep the site running and to stop abuse, not to identify you. We don't add
      any tracking of our own.
    </p>

    <h2>Other companies</h2>
    <p>
      The site loads no third-party scripts, fonts, videos or embeds. Fonts and images are served from this site, so
      your visit isn't shared with an outside company. The only outside service involved is Mojang's skin API, and only
      when you look up a username.
    </p>

    <h2>Children</h2>
    <p>
      The site is suitable for all ages and collects no personal information from anyone, including children. There's
      nothing to sign up for.
    </p>

    <h2>Your rights</h2>
    <p>
      Privacy laws such as the GDPR in the UK and EU and the CCPA in California give you the right to see, correct or
      delete personal data a site holds about you. We don't hold any, so there's nothing to hand over or erase. If you
      have a question, get in touch through the Discord or TikTok links in the footer.
    </p>

    <h2>Changes</h2>
    <p>If this policy changes, the date at the top will change with it.</p>

    <p class="back-links">
      <RouterLink to="/terms">Terms of use</RouterLink> · <RouterLink to="/">Back to the items</RouterLink>
    </p>
  </article>
</template>
