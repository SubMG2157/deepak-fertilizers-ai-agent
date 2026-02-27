// backend/exotel/orderExtractor.ts
import { productCatalog, findProduct } from '../knowledge/productCatalog';

interface ConversationState {
  items: Map<string, number>;
  [key: string]: any;
}

/**
 * Extract product and quantity mentions from user speech
 */
export function extractOrderFromTranscript(
  text: string,
  session: ConversationState
): void {
  const lowerText = text.toLowerCase();

  // Extract quantities
  const quantities = extractQuantities(lowerText);

  // Extract product names
  const products = extractProducts(lowerText);

  // Match quantities with products
  if (quantities.length > 0 && products.length > 0) {
    // Pair quantities with products
    for (let i = 0; i < Math.min(quantities.length, products.length); i++) {
      const product = products[i];
      const quantity = quantities[i];

      // Update or add to cart
      const currentQty = session.items.get(product) || 0;
      session.items.set(product, currentQty + quantity);

      console.log(`🛒 Added to cart: ${product} x ${quantity}`);
    }
  } else if (products.length > 0) {
    // Product mentioned without quantity, default to 1
    products.forEach(product => {
      const currentQty = session.items.get(product) || 0;
      session.items.set(product, currentQty + 1);
      console.log(`🛒 Added to cart: ${product} x 1 (default)`);
    });
  }
}

/**
 * Extract quantity numbers from text
 */
function extractQuantities(text: string): number[] {
  const quantities: number[] = [];

  // Marathi number words
  const marathiNumbers: Record<string, number> = {
    'एक': 1, 'दोन': 2, 'तीन': 3, 'चार': 4, 'पाच': 5,
    'सहा': 6, 'सात': 7, 'आठ': 8, 'नऊ': 9, 'दहा': 10
  };

  // Hindi number words
  const hindiNumbers: Record<string, number> = {
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5,
    'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10
  };

  // Check for Marathi/Hindi number words
  for (const [word, num] of Object.entries({ ...marathiNumbers, ...hindiNumbers })) {
    if (text.includes(word)) {
      quantities.push(num);
    }
  }

  // Check for digit numbers (1, 2, 3, etc.)
  const digitMatches = text.match(/\b\d+\b/g);
  if (digitMatches) {
    digitMatches.forEach(match => {
      const num = parseInt(match, 10);
      if (num > 0 && num < 100) {
        quantities.push(num);
      }
    });
  }

  // Check for bag/packet mentions
  const bagPatterns = [
    /(\d+)\s*पिशव/g,
    /(\d+)\s*bag/g,
    /(\d+)\s*packet/g
  ];

  bagPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      quantities.push(parseInt(match[1], 10));
    }
  });

  return quantities;
}

/**
 * Extract product names from text using fuzzy matching
 */
function extractProducts(text: string): string[] {
  const products: string[] = [];

  // Get all product names and aliases from catalog
  const allProductNames = productCatalog.flatMap(p => [p.name, ...(p.alias || [])]);

  // Check each product name/alias
  for (const productName of allProductNames) {
    // Simple substring check
    if (text.includes(productName.toLowerCase())) {
      // Find the canonical name
      const product = productCatalog.find(p =>
        p.name.toLowerCase() === productName.toLowerCase() ||
        (p.alias || []).some(a => a.toLowerCase() === productName.toLowerCase())
      );

      if (product && !products.includes(product.name)) {
        products.push(product.name);
      }
    }
  }

  // Fuzzy match if no exact matches found
  if (products.length === 0) {
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length > 3) { // Skip very short words
        const match = findProduct(word)?.name;
        if (match && !products.includes(match)) {
          products.push(match);
        }
      }
    }
  }

  return products;
}

/**
 * Parse complete order information from conversation
 */
export function parseOrderDetails(transcript: Array<{ role: string; text: string }>): {
  items: Array<{ product: string; quantity: number }>;
  address?: string;
  village?: string;
  taluka?: string;
  pincode?: string;
} {
  const items: Array<{ product: string; quantity: number }> = [];
  let address = '';
  let village = '';
  let taluka = '';
  let pincode = '';

  // Combine all user messages
  const allUserText = transcript
    .filter(t => t.role === 'user')
    .map(t => t.text)
    .join(' ');

  // Extract location information
  const pincodeMatch = allUserText.match(/\b\d{6}\b/);
  if (pincodeMatch) {
    pincode = pincodeMatch[0];
  }

  // Extract taluka (common Maharashtrian talukas)
  const talukas = ['दौंड', 'पुणे', 'सातारा', 'नाशिक', 'सोलापूर', 'औरंगाबाद'];
  for (const t of talukas) {
    if (allUserText.includes(t)) {
      taluka = t;
      break;
    }
  }

  return {
    items,
    address,
    village,
    taluka,
    pincode
  };
}
