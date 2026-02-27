// backend/services/smsService.ts - UPDATED FOR EXOTEL
import exotelClient from '../exotel/exotelClient';
import { getProductPrice } from '../knowledge/productCatalog';

interface SMSParams {
  to: string;
  customerName: string;
  items: Array<{ product: string; quantity: number; price?: number }>;
  orderId: string;
  address?: string;
  village?: string;
  taluka?: string;
  pincode?: string;
}

/**
 * Send order confirmation SMS via Exotel
 */
export async function sendOrderSms(
  to: string,
  customerName: string,
  items: Array<{ product: string; quantity: number; price?: number }>,
  orderId: string,
  address?: string,
  village?: string,
  taluka?: string,
  pincode?: string
): Promise<void> {
  try {
    console.log('📧 Sending SMS via Exotel to:', to);

    // Build SMS message
    const message = buildSmsMessage({
      to,
      customerName,
      items,
      orderId,
      address,
      village,
      taluka,
      pincode
    });

    // Send via Exotel
    await exotelClient.sendSMS({
      to: normalizePhoneNumber(to),
      message
    });

    console.log('✅ SMS sent successfully');
  } catch (error: any) {
    console.error('❌ SMS sending failed:', error.message);
    throw error;
  }
}

/**
 * Build formatted SMS message
 */
function buildSmsMessage(params: SMSParams): string {
  const { customerName, items, orderId, address, village, taluka, pincode } = params;

  let msg = `नमस्कार ${customerName}जी,\n\n`;
  msg += `आपला ऑर्डर तपशील:\n\n`;

  // Add customer info if available
  if (village || taluka || pincode) {
    msg += `नाव: ${customerName}\n`;
    if (village) msg += `गाव: ${village}\n`;
    if (taluka) msg += `तालुका: ${taluka}\n`;
    if (pincode) msg += `पिनकोड: ${pincode}\n`;
    msg += `\n`;
  }

  msg += `उत्पादन तपशील:\n`;

  let total = 0;

  // Add items with pricing
  items.forEach((item) => {
    // Get price from catalog if not provided
    const price = item.price || getPriceFromCatalog(item.product);
    const subtotal = item.quantity * price;
    total += subtotal;

    msg += `${item.product} - ${item.quantity} पिशव्या\n`;
    msg += `दर: ₹${price} प्रति पिशवी\n`;
    msg += `उपएकूण: ₹${subtotal}\n\n`;
  });

  msg += `एकूण रक्कम: ₹${total}\n\n`;
  msg += `ऑर्डर ID: ${orderId}\n\n`;

  // Add payment link
  msg += `पेमेंट करण्यासाठी ही लिंक वापरा:\n`;
  msg += `https://amrutpeth.com/product/mahadhan-smartek-102626\n\n`;

  msg += `धन्यवाद - दीपक फर्टिलायझर्स 🌾\n`;
  msg += `सुपूर्तता: 3-4 दिवसात`;

  return msg;
}

/**
 * Get product price from catalog
 */
function getPriceFromCatalog(productName: string): number {
  const price = getProductPrice(productName);
  return price > 0 ? price : 1200; // Default price if not found
}

/**
 * Normalize phone number for Exotel
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // If starts with +91, remove +
  if (phone.startsWith('+91')) {
    cleaned = cleaned;
  }

  // If starts with 91, keep as is
  if (cleaned.startsWith('91')) {
    return cleaned;
  }

  // If starts with 0, remove it
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If 10 digits, add country code
  if (cleaned.length === 10) {
    return '91' + cleaned;
  }

  return cleaned;
}

/**
 * Send simple text SMS (for testing)
 */
export async function sendSimpleSms(to: string, message: string): Promise<void> {
  try {
    await exotelClient.sendSMS({
      to: normalizePhoneNumber(to),
      message
    });
    console.log('✅ Simple SMS sent');
  } catch (error: any) {
    console.error('❌ Simple SMS failed:', error.message);
    throw error;
  }
}
