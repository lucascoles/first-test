/**
 * XYON Health — canonical brand & product configuration.
 * All ad generators import from here to ensure consistency.
 */

export const BRAND = {
  name: "XYON Health",
  tagline: "The New Standard in Treating Hair Loss",
  colors: {
    primary: "#2a2a2a",   // charcoal
    secondary: "#ffffff",
    accent: "#c9a96e",    // warm gold used in hero sections
  },
  tone: "clinical, premium, trustworthy, results-driven",
  founders: "founded by board-certified hair restoration specialists",
  technology: "SiloxysSystem™ GelRx — proprietary topical delivery technology",
  model: "online prescription + free discreet shipping",
};

export const PRODUCTS = {
  topicalFinasteride: {
    id: "topical-finasteride",
    name: "Topical Finasteride with SiloxysSystem™ GelRx",
    shortName: "Topical Finasteride Gel",
    category: "men",
    rx: true,
    keyBenefit: "Targets the scalp directly to reduce systemic side-effect risk",
    startingPrice: 99,
    imageAsset: "https://xyonhealth.com/cdn/shop/products/topical-finasteride-gel.jpg",
  },
  topicalCombo: {
    id: "topical-combo",
    name: "Topical Finasteride & Minoxidil with SiloxysSystem™ GelRx",
    shortName: "Finasteride + Minoxidil Gel",
    category: "men",
    rx: true,
    keyBenefit: "Dual-action DHT blocker + growth stimulator in a single application",
    startingPrice: 119,
    imageAsset: "https://xyonhealth.com/cdn/shop/products/topical-combo-gel.jpg",
  },
  topicalDutasteride: {
    id: "topical-dutasteride",
    name: "Topical Dutasteride with SiloxysSystem™ GelRx",
    shortName: "Topical Dutasteride Gel",
    category: "men",
    rx: true,
    keyBenefit: "Stronger DHT inhibition with targeted scalp delivery",
    startingPrice: 129,
    imageAsset: "https://xyonhealth.com/cdn/shop/products/topical-dutasteride-gel.jpg",
  },
  dhtShampoo: {
    id: "dht-shampoo",
    name: "DHT-Blocking Shampoo",
    shortName: "DHT Shampoo",
    category: "haircare",
    rx: false,
    keyBenefit: "Daily defense against DHT at the scalp",
    startingPrice: 28,
    imageAsset: "https://xyonhealth.com/cdn/shop/products/dht-shampoo.jpg",
  },
  dhtConditioner: {
    id: "dht-conditioner",
    name: "DHT-Blocking Conditioner",
    shortName: "DHT Conditioner",
    category: "haircare",
    rx: false,
    keyBenefit: "Strengthens and protects hair while blocking DHT",
    startingPrice: 28,
    imageAsset: "https://xyonhealth.com/cdn/shop/products/dht-conditioner.jpg",
  },
};

/** Ad format specs — dimensions and placement context */
export const AD_FORMATS = {
  instagramFeed:    { width: 1080, height: 1080, label: "Instagram Feed (1:1)" },
  instagramStory:   { width: 1080, height: 1920, label: "Instagram Story (9:16)" },
  facebookFeed:     { width: 1200, height: 628,  label: "Facebook Feed (1.91:1)" },
  displayBanner:    { width: 728,  height: 90,   label: "Display Leaderboard" },
  displayRectangle: { width: 300,  height: 250,  label: "Display Medium Rectangle" },
};
