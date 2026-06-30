/**
 * App Seed Script — adds test dealers, electricians, products, banners, notifications
 * Run: npx ts-node -r tsconfig-paths/register src/database/seeds/app-seed.ts
 */
import { DataSource } from 'typeorm';
import { Dealer } from '../entities/dealer.entity';
import { Electrician } from '../entities/electrician.entity';
import { Product } from '../entities/product.entity';
import { Banner } from '../entities/banner.entity';
import { Notification } from '../entities/notification.entity';
import { Offer } from '../entities/offer.entity';
import { Testimonial } from '../entities/testimonial.entity';
import { QrCode } from '../entities/qr-code.entity';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: 'postgres',
  password: '4268',
  database: 'srv_admin',
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  synchronize: false,
});

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ DB connected');

  // ── Dealers ──────────────────────────────────────────────────────────
  const dealerRepo = AppDataSource.getRepository(Dealer);
  const existingDealer = await dealerRepo.findOne({ where: { phone: '9876543210' } });
  let dealer: Dealer;

  if (!existingDealer) {
    dealer = dealerRepo.create({
      name: 'Sharma Electricals',
      phone: '9876543210',
      dealerCode: 'PB-05-800206-001',
      town: 'Mansa',
      district: 'Mansa',
      state: 'Punjab',
      address: 'Shop No. 18, Power Market, Near Bus Stand, Mansa, Punjab 151505',
      pincode: '151505',
      tier: 'Silver' as any,
      status: 'active' as any,
      electricianCount: 0,
    });
    dealer = await dealerRepo.save(dealer);
    console.log('✅ Dealer created:', dealer.phone);
  } else {
    dealer = existingDealer;
    console.log('ℹ️  Dealer already exists');
  }

  // ── Electricians ──────────────────────────────────────────────────────
  const elecRepo = AppDataSource.getRepository(Electrician);
  const testElectricians = [
    { name: 'Harshvardhan', phone: '9162038214', code: 'PB03900-001', city: 'Mansa', points: 7000, scans: 48 },
    { name: 'Rohit Kumar', phone: '9871234560', code: 'PB03900-002', city: 'Bathinda', points: 2870, scans: 18 },
    { name: 'Aman Sharma', phone: '9810012345', code: 'PB03900-003', city: 'Ludhiana', points: 1200, scans: 12 },
  ];

  for (const e of testElectricians) {
    const exists = await elecRepo.findOne({ where: { phone: e.phone } });
    if (!exists) {
      const elec = elecRepo.create({
        name: e.name,
        phone: e.phone,
        electricianCode: e.code,
        city: e.city,
        state: 'Punjab',
        district: 'Punjab',
        tier: e.points >= 5001 ? 'Platinum' : e.points >= 1001 ? 'Gold' : 'Silver' as any,
        totalPoints: e.points,
        totalScans: e.scans,
        walletBalance: e.points,
        status: 'active' as any,
        dealerId: dealer.id,
      });
      await elecRepo.save(elec);
      console.log('✅ Electrician created:', e.phone);
    } else {
      console.log('ℹ️  Electrician exists:', e.phone);
    }
  }

  // Update dealer electrician count
  await dealerRepo.update(dealer.id, { electricianCount: testElectricians.length });

  // ── Products ──────────────────────────────────────────────────────────
  const productRepo = AppDataSource.getRepository(Product);
  const products = [
    { name: 'FAN BOX 3" RANGE', sub: 'F8/FC/FDB 18-40 PC', category: 'fanbox', points: 10, price: 89, image: 'https://srvelectricals.com/cdn/shop/files/F8_3_18-40.png?v=1757426631&width=320', badge: 'Popular', sku: 'FB-3-001' },
    { name: 'FAN BOX 4" RANGE', sub: 'FC 4 17-30/20-40 PC', category: 'fanbox', points: 12, price: 104, image: 'https://srvelectricals.com/cdn/shop/files/FC_4_17-30.png?v=1757426626&width=320', badge: '', sku: 'FB-4-001' },
    { name: 'CONCEALED BOX 3"', sub: 'CRD PL precision build', category: 'concealedbox', points: 15, price: 120, image: 'https://srvelectricals.com/cdn/shop/files/CRD_PL_3.png?v=1757426566&width=320', badge: 'Best Seller', sku: 'CB-3-001' },
    { name: 'MODULE BOX PLATINUM', sub: 'Premium modular range', category: 'modularbox', points: 25, price: 180, image: 'https://srvelectricals.com/cdn/shop/files/3x3_679e5d30-ecf2-446e-9452-354bbf4c4a26.png?v=1757426377&width=320', badge: 'Premium', sku: 'MB-P-001' },
    { name: 'LED FLOOD LIGHT SLEEK', sub: 'Outdoor high-throw lighting', category: 'led', points: 30, price: 699, image: 'https://srvelectricals.com/cdn/shop/files/FloodLightSleek.png?v=1757426471&width=320', badge: '', sku: 'LED-FL-001' },
    { name: 'MCB BOX 4 WAY GI', sub: 'Reliable DB box for sites', category: 'mcb', points: 40, price: 830, image: 'https://srvelectricals.com/cdn/shop/files/MCB_Box_4_Way_GI.png?v=1757426418&width=320', badge: '', sku: 'MCB-4W-001' },
    { name: 'BUS BAR 100A SUPER', sub: 'TATA GPSP Sheet', category: 'busbar', points: 50, price: 450, image: 'https://srvelectricals.com/cdn/shop/files/Bus_Bar_100A_Super.png?v=1757426672&width=320', badge: '', sku: 'BB-100-001' },
    { name: 'AUTO CHANGEOVER 32A', sub: 'Single Phase Auto Switch', category: 'changeover', points: 50, price: 1200, image: 'https://srvelectricals.com/cdn/shop/files/ACO_100A_FP.png?v=1757426480&width=320', badge: 'Popular', sku: 'ACO-32-001' },
    { name: '2-PIN PLUG GIRISH', sub: 'Girish series premium quality', category: 'accessories', points: 5, price: 25, image: 'https://srvelectricals.com/cdn/shop/files/2-Pin-Girish.png?v=1756461334&width=240', badge: 'New', sku: 'ACC-2P-001' },
    { name: 'KITCHEN FAN ROYAL', sub: 'Premium Ventilation Series', category: 'exhaust', points: 45, price: 850, image: 'https://srvelectricals.com/cdn/shop/files/Kitchen-Fan-Royal.png?v=1741846906&width=320', badge: '', sku: 'EF-KR-001' },
  ];

  const qrRepo = AppDataSource.getRepository(QrCode);
  for (const p of products) {
    const exists = await productRepo.findOne({ where: { sku: p.sku } });
    if (!exists) {
      const product = productRepo.create({
        name: p.name,
        sub: p.sub,
        category: p.category,
        points: p.points,
        price: p.price,
        image: p.image,
        badge: p.badge,
        sku: p.sku,
        isActive: true,
        stock: 100,
      });
      const saved = await productRepo.save(product);

      // Create 5 QR codes per product for testing
      for (let i = 1; i <= 5; i++) {
        const qr = qrRepo.create({
          code: `SRV-${p.sku}-QR${i.toString().padStart(3, '0')}`,
          productId: saved.id,
          productName: saved.name,
          isActive: true,
          isScanned: false,
        });
        await qrRepo.save(qr);
      }
      console.log(`✅ Product + 5 QR codes: ${p.name}`);
    } else {
      console.log(`ℹ️  Product exists: ${p.name}`);
    }
  }

  // ── Banners ──────────────────────────────────────────────────────────
  const bannerRepo = AppDataSource.getRepository(Banner);
  const bannerCount = await bannerRepo.count();
  if (bannerCount === 0) {
    const banners = [
      { title: 'Auto Changeover Switch', imageUrl: 'https://srvelectricals.com/cdn/shop/files/aco.jpg', bgColor: '#192F67', displayOrder: 1, targetRole: ['electrician', 'dealer'] },
      { title: 'Appliances Range', imageUrl: 'https://srvelectricals.com/cdn/shop/files/appliances.jpg', bgColor: '#E8C973', displayOrder: 2, targetRole: ['electrician', 'dealer'] },
      { title: 'MCB Box Range', imageUrl: 'https://srvelectricals.com/cdn/shop/files/mcb-box.jpg', bgColor: '#7C8BD7', displayOrder: 3, targetRole: ['electrician'] },
    ];
    for (const b of banners) {
      await bannerRepo.save(bannerRepo.create({ ...b, isActive: true, status: 'active' }));
    }
    console.log('✅ Banners created');
  }

  // ── Notifications ─────────────────────────────────────────────────────
  const notifRepo = AppDataSource.getRepository(Notification);
  const notifCount = await notifRepo.count();
  if (notifCount === 0) {
    const notifs = [
      { title: 'Price Update', message: 'The price of 4 way DD has been updated to Rs.306.', targetRole: 'electrician', status: 'sent', sentAt: new Date() },
      { title: 'Scheme Notice', message: 'Selected SRV reward schemes have updated slabs for this week.', targetRole: null, status: 'sent', sentAt: new Date() },
      { title: 'Important SRV Announcement', message: 'Keep your profile and bank details updated for smooth redemptions and withdrawals.', targetRole: null, status: 'sent', sentAt: new Date() },
    ];
    for (const n of notifs) {
      await notifRepo.save(notifRepo.create(n as any));
    }
    console.log('✅ Notifications created');
  }

  // ── Offers ────────────────────────────────────────────────────────────
  const offerRepo = AppDataSource.getRepository(Offer);
  const offerCount = await offerRepo.count();
  if (offerCount === 0) {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const offers = [
      { title: 'Rs 100 Cashback', description: 'Direct UPI or bank transfer', bonusPoints: 500, targetRole: 'electrician', status: 'active', validFrom: today, validTo: nextMonth, discount: 'RS' },
      { title: 'Amazon Voucher', description: 'Rs 200 gift card code', bonusPoints: 1000, targetRole: 'electrician', status: 'active', validFrom: today, validTo: nextMonth, discount: 'AZ' },
      { title: 'SRV Product Bundle', description: 'Free kit worth Rs 500', bonusPoints: 2000, targetRole: 'electrician', status: 'active', validFrom: today, validTo: nextMonth, discount: 'SRV' },
      { title: 'Paytm Voucher', description: 'Rs 150 wallet credit', bonusPoints: 750, targetRole: 'electrician', status: 'active', validFrom: today, validTo: nextMonth, discount: 'PY' },
    ];
    for (const o of offers) {
      await offerRepo.save(offerRepo.create(o as any));
    }
    console.log('✅ Offers created');
  }

  // ── Testimonials ──────────────────────────────────────────────────────
  const testimonialRepo = AppDataSource.getRepository(Testimonial);
  const testimonialCount = await testimonialRepo.count();
  if (testimonialCount === 0) {
    const testimonials = [
      { personName: 'Gurpreet Singh', initials: 'GS', location: 'Amritsar', tier: 'Diamond', yearsConnected: 4, quote: 'Whether it is a big installation or a quick site visit, SRV feels dependable both in product quality and app flow.', highlight: 'Reliable performance on real job sites', gradientColors: ['#EEF2FF', '#D9D6FE', '#C4B5FD'], ringColor: '#7C3AED', isActive: true, displayOrder: 1 },
      { personName: 'Amit Verma', initials: 'AV', location: 'Panchkula', tier: 'Platinum', yearsConnected: 3, quote: 'Points get added fast after scanning, and reward tracking is much cleaner than before.', highlight: 'Fast scan flow with clear rewards', gradientColors: ['#ECFEFF', '#CFFAFE', '#A5F3FC'], ringColor: '#0F766E', isActive: true, displayOrder: 2 },
      { personName: 'Harpal Kaur', initials: 'HK', location: 'Jalandhar', tier: 'Platinum', yearsConnected: 2, quote: 'Dealer support feels available whenever needed, and the whole experience stays smooth while working in the field.', highlight: 'Built for day-to-day field work', gradientColors: ['#F7FEE7', '#DCFCE7', '#BEF264'], ringColor: '#65A30D', isActive: true, displayOrder: 3 },
      { personName: 'Ravi Sharma', initials: 'RS', location: 'Mohali', tier: 'Gold', yearsConnected: 3, quote: 'Rewards come on time and the points calculation is completely transparent.', highlight: 'Transparent rewards and timely payments', gradientColors: ['#FFF7E6', '#FDE6B4', '#F6C96E'], ringColor: '#D97706', isActive: true, displayOrder: 4 },
      { personName: 'Naveen Kumar', initials: 'NK', location: 'Ludhiana', tier: 'Silver', yearsConnected: 1, quote: 'Even though I am new, I got great support. The app is easy to learn and use.', highlight: 'Good start and easy learning curve', gradientColors: ['#FFF1EC', '#FFD8CC', '#F6B9A4'], ringColor: '#C2410C', isActive: true, displayOrder: 5 },
    ];
    for (const t of testimonials) {
      await testimonialRepo.save(testimonialRepo.create(t));
    }
    console.log('✅ Testimonials created');
  }

  await AppDataSource.destroy();
  console.log('\n🎉 App seed completed!');
  console.log('\n📱 Test Login Credentials:');
  console.log('   Electrician: 9162038214 (OTP: 1234)');
  console.log('   Electrician: 9871234560 (OTP: 1234)');
  console.log('   Dealer:      9876543210 (OTP: 1234)');
  console.log('\n🔑 QR Codes for testing scan:');
  console.log('   SRV-FB-3-001-QR001 to QR005 (Fan Box 3")');
  console.log('   SRV-CB-3-001-QR001 to QR005 (Concealed Box 3")');
}

seed().catch(console.error);
