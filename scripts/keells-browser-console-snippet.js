/*
Paste this whole file into DevTools on a Keells meat listing page.

It scans visible product-card-like elements and returns a raw array shaped for:
  npm run keells:transform -- input.json output.json

Selectors on retail sites change over time. If this starts missing fields, update:
  - cardSelectors
  - titleSelectors
  - priceSelectors
  - sizeSelectors
  - availabilitySelectors
*/

(() => {
  const normalizeText = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized || null;
  };

  const isVisible = (element) => {
    if (!(element instanceof Element)) {
      return false;
    }

    if (element.closest("[hidden], [aria-hidden='true']")) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
  };

  const textFromSelectors = (root, selectors) => {
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        if (!isVisible(element)) {
          continue;
        }

        const text = normalizeText(element.textContent);
        if (text) {
          return text;
        }
      }
    }

    return null;
  };

  const firstVisibleLink = (root) => {
    for (const link of root.querySelectorAll("a[href]")) {
      if (isVisible(link)) {
        return link;
      }
    }

    return null;
  };

  const absoluteUrl = (href) => {
    try {
      return new URL(href, window.location.href).toString();
    } catch {
      return null;
    }
  };

  const inferSizeFromText = (root) => {
    const text = normalizeText(root.textContent);
    if (!text) {
      return null;
    }

    const match = text.match(/\b(?:per\s*)?\d+(?:\.\d+)?\s?(?:kg|g)\b(?:\(s\))?/i);
    return match ? normalizeText(match[0]) : null;
  };

  const inferAvailabilityFromText = (root) => {
    const text = normalizeText(root.textContent)?.toLowerCase();
    if (!text) {
      return null;
    }

    if (/\b(out of stock|sold out|unavailable)\b/i.test(text)) {
      return "Out of Stock";
    }

    if (/\b(in stock|available)\b/i.test(text)) {
      return "In Stock";
    }

    return null;
  };

  const cardSelectors = [
    "[data-product-id]",
    "[data-productid]",
    "[data-sku]",
    "article[class*='product']",
    "div[class*='product']",
    "li[class*='product']",
    "article",
    "li"
  ];

  const titleSelectors = [
    "[data-testid*='title']",
    "[class*='product-name']",
    "[class*='productName']",
    "[class*='name']",
    "h1",
    "h2",
    "h3",
    "h4",
    "a[title]"
  ];

  const priceSelectors = [
    "[data-testid*='price']",
    "[class*='price']",
    "[class*='Price']",
    "[data-price]",
    "[aria-label*='price' i]"
  ];

  const sizeSelectors = [
    "[data-testid*='size']",
    "[class*='size']",
    "[class*='weight']",
    "[class*='pack']",
    "[class*='unit']"
  ];

  const availabilitySelectors = [
    "[data-testid*='stock']",
    "[data-testid*='availability']",
    "[class*='stock']",
    "[class*='availability']",
    "[class*='sold']"
  ];

  const candidates = Array.from(
    new Set(cardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
  );

  const products = candidates
    .filter((root) => isVisible(root))
    .map((root) => {
      const link = firstVisibleLink(root);
      const name =
        textFromSelectors(root, titleSelectors) ||
        normalizeText(link?.getAttribute("title")) ||
        normalizeText(link?.textContent);
      const url = absoluteUrl(link?.getAttribute("href") || "");
      const price = textFromSelectors(root, priceSelectors);
      const size = textFromSelectors(root, sizeSelectors) || inferSizeFromText(root);
      const availability = textFromSelectors(root, availabilitySelectors) || inferAvailabilityFromText(root);
      const productId =
        normalizeText(root.getAttribute("data-product-id")) ||
        normalizeText(root.getAttribute("data-productid")) ||
        normalizeText(root.getAttribute("data-sku")) ||
        null;

      if (!name || !url) {
        return null;
      }

      if (!price && !size && !availability) {
        return null;
      }

      return {
        ...(productId ? { productId } : {}),
        name,
        url,
        ...(price ? { price } : {}),
        ...(size ? { size } : {}),
        ...(availability ? { availability } : {}),
        notes: "Captured from visible Keells browser listing cards via DevTools snippet."
      };
    })
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.url === item.url) === index);

  window.__keellsCapture = products;

  if (typeof copy === "function") {
    copy(JSON.stringify(products, null, 2));
    console.info(`Captured ${products.length} products. JSON copied to clipboard as window.__keellsCapture.`);
  } else {
    console.info(`Captured ${products.length} products. Read window.__keellsCapture and copy it manually.`);
  }

  return products;
})();
