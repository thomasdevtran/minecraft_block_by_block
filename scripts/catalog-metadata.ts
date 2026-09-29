/** Categories for flat inventory items; first match wins. */
export const ITEM_GROUPS: [string, RegExp][] = [
  ['Mob Heads', /(_head$|_skull$)/],
  ['Spawn Eggs', /_spawn_egg$/],
  ['Music & Collectibles', /^(music_disc_|.*pottery_sherd$|.*smithing_template$|.*banner_pattern$|disc_fragment_|goat_horn$|enchanted_book$|nether_star$|trial_key$|ominous_trial_key$|heart_of_the_sea$)/],
  ['Armor & Wearables', /(_helmet$|_chestplate$|_leggings$|_boots$|_armor$|_harness$|^elytra$|^turtle_helmet$)/],
  ['Weapons & Combat', /(_sword$|_spear$|^bow$|^crossbow$|^trident$|^mace$|^shield$|arrow$|^wind_charge$|^totem_of_undying$|^snowball$|^fire_charge$)/],
  ['Potions & Brewing', /(potion$|^brewing_stand$|^cauldron$|^glass_bottle$|^blaze_powder$|^blaze_rod$|^ghast_tear$|^magma_cream$|^fermented_spider_eye$|^spider_eye$|^glistering_melon_slice$|^nether_wart$|^dragon_breath$|^experience_bottle$|^ominous_bottle$|^phantom_membrane$|^rabbit_foot$)/],
  ['Food & Drinks', /^(apple|golden_apple|bread|cookie|cake|pumpkin_pie|beef|porkchop|chicken|mutton|rabbit|cod|salmon|tropical_fish|pufferfish|cooked_.*|dried_kelp|carrot|golden_carrot|potato|baked_potato|poisonous_potato|beetroot|melon_slice|sweet_berries|glow_berries|mushroom_stew|rabbit_stew|beetroot_soup|suspicious_stew|rotten_flesh|honey_bottle|milk_bucket|chorus_fruit|egg|blue_egg|brown_egg)$/],
  ['Redstone & Transport', /(rail$|minecart$|_boat$|_raft$|^redstone$|^redstone_torch$|^repeater$|^comparator$|^lever$|^hopper$|^tripwire_hook$|^firework_rocket$|^saddle$)/],
  ['Tools & Equipment', /(_pickaxe$|_axe$|_shovel$|_hoe$|^fishing_rod$|^shears$|^flint_and_steel$|^brush$|^spyglass$|compass$|^clock$|^lead$|^name_tag$|bucket$|bundle$|^map$|^filled_map$|^ender_pearl$|^ender_eye$|^carrot_on_a_stick$|^warped_fungus_on_a_stick$|^recovery_compass$)/],
  ['Building & Decoration', /(_door$|_sign$|_candle$|_lantern$|_torch$|_campfire$|_bars$|_chain$|_cushion$|^torch$|^lantern$|^chain$|^iron_bars$|^campfire$|^painting$|item_frame$|^armor_stand$|^flower_pot$|^bell$|^ladder$|^candle$|^end_crystal$|amethyst_bud$|amethyst_cluster$|^turtle_egg$|^sniffer_egg$)/],
]
export const ITEM_GROUP_ORDER = [...ITEM_GROUPS.map(([name]) => name), 'Materials & Ingredients']
export const itemGroup = (id: string) => ITEM_GROUPS.find(([, pattern]) => pattern.test(id))?.[0] ?? 'Materials & Ingredients'

export function collectibleName(id: string, name: string, lang: Record<string, string>): string {
  if (id.startsWith('music_disc_')) {
    const description = lang[`item.minecraft.${id}.desc`]
    return description ? `Music Disc — ${description.split(' - ').slice(1).join(' - ') || description}` : name
  }
  if (id.endsWith('_armor_trim_smithing_template')) {
    return lang[`trim_pattern.minecraft.${id.replace('_armor_trim_smithing_template', '')}`] ?? name
  }
  if (id === 'netherite_upgrade_smithing_template') return 'Netherite Upgrade Template'
  if (id.endsWith('_banner_pattern')) return `Banner Pattern — ${lang[`item.minecraft.${id}.desc`] ?? id.replace('_banner_pattern', '').split('_').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ')}`
  return name
}
