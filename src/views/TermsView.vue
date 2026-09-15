<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SITE } from '../lib/site'
</script>

<template>
  <article class="container legal">
    <h1>Terms of use</h1>
    <p class="muted">Last updated {{ SITE.legalUpdated }}.</p>

    <p>
      {{ SITE.name }} is a free hobby site run by {{ SITE.operator.name }}. It turns Minecraft pictures into
      instructions for building them out of real cubes. By using it, you agree to what's below.
    </p>

    <h2>Not made by Mojang</h2>
    <p>
      This is an unofficial fan project. It is not approved by or associated with Mojang Studios or Microsoft.
      <strong>Minecraft</strong> is a trademark of Mojang Synergies AB. The game's pictures and names shown here belong
      to Mojang and are used to describe what you're building, following
      <a href="https://www.minecraft.net/en-us/usage-guidelines" target="_blank" rel="noopener noreferrer">Minecraft's usage guidelines</a>.
      Don't use this site to sell the game's artwork.
    </p>

    <h2>Building safely</h2>
    <p>
      The guides involve small pieces, glue and paint. Small cubes are a choking hazard for young children, so children
      should build with an adult. Follow the safety instructions on any glue or paint you use. You build at your own
      risk.
    </p>

    <h2>What we promise</h2>
    <p>
      Not much, honestly. The site is offered as is, free of charge, with no guarantee that it will be available, that
      the cube counts and colors are exactly right, or that a build will turn out how you expect. Paint colors are our
      best match to the game's pixels, and screens show color differently than paint does. Please check the materials
      list before buying anything.
    </p>
    <p>
      To the extent the law allows, we aren't liable for any loss that comes from using the site, including wasted
      materials or time.
    </p>

    <h2>Fair use of the site</h2>
    <p>
      Use it for your own builds and share what you make. Please don't hammer the skin lookup with automated requests,
      try to break the site, or copy it wholesale and pass it off as your own.
    </p>

    <h2>Your files</h2>
    <p>
      Skin files you upload stay in your browser and are never sent to us, so you keep all rights to them. See the
      <RouterLink to="/privacy">privacy page</RouterLink> for details.
    </p>

    <h2>Credits</h2>
    <ul>
      <li>Game pictures: Mojang Studios, taken from the official Minecraft game files.</li>
      <li>Pixelify Sans font by Eiver Tirado, under the SIL Open Font License 1.1.</li>
      <li>Built with Vue and three.js, both under the MIT license.</li>
    </ul>

    <h2>Which country's law applies</h2>
    <p v-if="SITE.operator.country">
      These terms are governed by the law of {{ SITE.operator.country }}.
    </p>
    <p v-else class="notice">
      <strong>To fill in:</strong> add the country whose law applies, and the name of the person or business running the
      site, in <code>src/lib/site.ts</code>.
    </p>

    <h2>Changes</h2>
    <p>These terms may change; the date at the top will change with them.</p>

    <p class="back-links">
      <RouterLink to="/privacy">Privacy &amp; cookies</RouterLink> · <RouterLink to="/">Back to the items</RouterLink>
    </p>
  </article>
</template>
