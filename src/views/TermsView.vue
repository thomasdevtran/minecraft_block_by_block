<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SITE } from '../lib/site'
</script>

<template>
  <article class="container legal">
    <p class="muted">Using the guides</p>
    <h1>Terms of use</h1>
    <p class="muted">Last updated {{ SITE.legalUpdated }}.</p>
    <p class="intro">{{ SITE.name }} provides free instructions for making cube crafts inspired by Minecraft. It is operated by {{ SITE.operator.name }} in {{ SITE.operator.country }}. Questions, payment issues or rights concerns can be sent to <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a>.</p>
    <div class="summary"><p><strong>Independent fan project.</strong> Not an official Minecraft product or service. Not approved by or associated with Mojang or Microsoft.</p></div>
    <nav class="contents" aria-label="Terms topics"><a href="#safety">Build safely</a><a href="#rights">Content rights</a><a href="#payments">Support payments</a></nav>

    <h2 id="safety">Build safely</h2>
    <p>Small cubes are a choking hazard. Keep them away from children under three and supervise older children. Adults should handle cutting tools and hot glue. Follow the age, ventilation, drying and handling instructions for your paints, adhesives and tools. Finished crafts are decorative objects, not safety-tested toys.</p>
    <p>Use equal-size cubes and check the materials and stability before building. Some designs need backing boards or extra support, and larger cubes can make a model heavy. Let paint and glue cure fully before handling the finished build.</p>

    <h2>Using the guides</h2>
    <p>You may use these guides for your personal craft projects and share photos of your own builds, subject to the rights of the relevant content owners. Do not misrepresent this site as official, misuse player lookups, bypass security measures, or interfere with other visitors' access.</p>
    <p>Only use skin files you own or have permission to use. A public player skin is not automatically licensed for resale or redistribution. Uploading a file here does not transfer your rights to us, and the image stays in your browser.</p>

    <h2 id="rights">Minecraft and other content</h2>
    <p>All Minecraft block, item and entity textures and other game artwork shown on this site are owned by Mojang Studios. They are displayed for informational fan use only, and no ownership is claimed. Minecraft is a trademark of Mojang Synergies AB. This site's guides do not grant a license to sell Minecraft artwork, distribute extracted game assets, or sell branded merchandise. Refer to the <a href="https://www.minecraft.net/en-us/usage-guidelines" target="_blank" rel="noopener noreferrer">Minecraft Usage Guidelines</a> for the owner's conditions.</p>
    <p>If you believe content here infringes your rights, email <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a> with the relevant page, a description of the work and your contact details so we can investigate. Please do not send sensitive information you do not need to share.</p>

    <h2>Accuracy, availability and responsibility</h2>
    <p>Guides are generated from digital images. Cube counts, assembly suggestions and paint matches may contain errors. Screens and real paint show colors differently, so check a small sample before buying materials or starting a large build. Local progress can be lost if browser data is cleared.</p>
    <p>The site is provided as available and as is, without guarantees of uninterrupted access or a particular result, to the extent permitted by applicable law. To that extent, the operator is not responsible for losses arising from use of the guides.</p>
    <p><strong>Nothing in these terms excludes liability that cannot lawfully be excluded or limits mandatory consumer rights.</strong> This includes protections that apply to you regardless of the wording of these terms.</p>

    <h2 id="payments">Voluntary support payments</h2>
    <p>Links on the <RouterLink to="/support">support page</RouterLink> lead to Ko-fi or PayPal. A contribution supports this independent project; it does not purchase goods, unlock guides or guarantee future features or individual support. This site is not presented as a registered charity, and we make no claim that contributions are tax-deductible. Payments support this project's independent operator, not Mojang or Microsoft.</p>
    <p>Check the recipient, amount and whether the payment is one-time or recurring on the payment provider's page before confirming. Only the account holder or someone authorized under the provider's rules should pay. Children should ask a parent or guardian to handle any contribution.</p>
    <p>For an accidental payment or refund request, contact <a :href="`mailto:${SITE.operator.email}`">{{ SITE.operator.email }}</a>. Requests are reviewed under applicable law and provider rules. These terms do not remove statutory refund or dispute rights. Any recurring support is managed through the provider where it was set up.</p>
    <p>Payments are handled by the external provider under its own terms and privacy policy. See our <RouterLink to="/privacy">privacy notice</RouterLink> for the transaction information the recipient may receive.</p>

    <h2>Credits and licenses</h2>
    <ul>
      <li>Minecraft textures, game artwork and names: owned by Mojang Studios. Used under the Minecraft Usage Guidelines.</li>
      <li>Pixelify Sans by Eiver Tirado: <a href="/fonts/OFL.txt">SIL Open Font License 1.1</a>.</li>
      <li>Vue, Vue Router and three.js: MIT-licensed software. <a href="/third-party-notices.txt">Third-party license notices</a>.</li>
    </ul>

    <h2>Applicable law</h2>
    <p>These terms are governed by California law, subject to any mandatory protections under the law that applies where you live. This does not remove rights or remedies that cannot be waived by agreement.</p>
    <h2>Changes</h2>
    <p>We may update the site and these terms. Material changes will be reflected in the date above and, where required, a notice or additional agreement. New terms do not retrospectively remove existing statutory rights.</p>
    <p class="back-links"><RouterLink to="/privacy">Privacy &amp; cookies</RouterLink> · <RouterLink to="/">Back to builds</RouterLink></p>
  </article>
</template>
