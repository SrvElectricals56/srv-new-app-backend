// Run inside the staging backend container. Every fixture and mutation is rolled back.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ds = require('/app/dist/database/data-source').default;
const entity = (file, name) => require(`/app/dist/database/entities/${file}.entity`)[name];
const Electrician = entity('electrician','Electrician'), Dealer = entity('dealer','Dealer');
const Wallet = entity('wallet','Wallet'), Redemption = entity('redemption','Redemption');
const AppUser = entity('app-user','AppUser'), CounterBoy = entity('counterboy','CounterBoy');
const QrCode = entity('qr-code','QrCode'), Scan = entity('scan','Scan'), Product = entity('product','Product');
const Notification = entity('notification','Notification');
const { FinanceService } = require('/app/dist/modules/finance/finance.service');
const { RedemptionService } = require('/app/dist/modules/redemption/redemption.service');
const { MobileAuthService } = require('/app/dist/modules/mobile-auth/mobile-auth.service');
const { QrCodeService } = require('/app/dist/modules/qr-code/qr-code.service');
const { TierService } = require('/app/dist/common/services/tier.service');
const { MobileService } = require('/app/dist/modules/mobile/mobile.service');

(async () => {
  assert.equal(process.env.DB_DATABASE, 'srv_staging');
  await ds.initialize();
  const runner = ds.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  const m=runner.manager, repo=e=>m.getRepository(e), transactional={transaction:fn=>fn(m)};
  const results=[];
  try {
    const a=await repo(Electrician).save(repo(Electrician).create({name:'QA Sender',phone:`QA-${randomUUID()}`,electricianCode:`QA-${randomUUID()}`.toUpperCase(),city:'QA',state:'QA',district:'QA',walletBalance:100,totalPoints:150}));
    const b=await repo(Electrician).save(repo(Electrician).create({name:'QA Receiver',phone:`QA-${randomUUID()}`,electricianCode:`QA-${randomUUID()}`.toUpperCase(),city:'QA',state:'QA',district:'QA',walletBalance:40,totalPoints:80}));
    const finance=new FinanceService(repo(Wallet),repo(Redemption),repo(Dealer),repo(Electrician),repo(AppUser),repo(CounterBoy),transactional);
    await finance.manualTransferPoints({fromUser:a.id,toUser:b.id,points:12.5},'QA');
    let sender=await repo(Electrician).findOneBy({id:a.id}), receiver=await repo(Electrician).findOneBy({id:b.id});
    assert.equal(sender.walletBalance,87.5); assert.equal(sender.totalPoints,137.5);
    assert.equal(receiver.walletBalance,52.5); assert.equal(receiver.totalPoints,92.5);
    const credit=await repo(Wallet).findOneBy({userId:b.id,referenceType:'points_transfer',type:'credit'});
    await finance.reverseTransfer(credit.id,'QA');
    sender=await repo(Electrician).findOneBy({id:a.id}); receiver=await repo(Electrician).findOneBy({id:b.id});
    assert.equal(sender.walletBalance,100); assert.equal(sender.totalPoints,150);
    assert.equal(receiver.walletBalance,40); assert.equal(receiver.totalPoints,80);
    await assert.rejects(()=>finance.reverseTransfer(credit.id,'QA'));
    await assert.rejects(()=>finance.manualTransferPoints({fromUser:a.id,toUser:b.id,points:-1},'QA'));
    await assert.rejects(()=>finance.manualTransferPoints({fromUser:a.id,toUser:b.id,points:1000},'QA'));
    assert.equal(await repo(Wallet).count({where:{referenceId:credit.id,referenceType:'transfer_reversal'}}),2);
    results.push('Transfer debits sender and credits receiver; reverse restores both balances and points; repeat and invalid transfers rejected');

    const auth=Object.create(MobileAuthService.prototype); auth.tierService=Object.create(TierService.prototype);
    await auth.applyReferralReward(m,a.electricianCode,{...b,role:'electrician'});
    await auth.applyReferralReward(m,a.electricianCode,{...b,role:'electrician'});
    sender=await repo(Electrician).findOneBy({id:a.id}); receiver=await repo(Electrician).findOneBy({id:b.id});
    assert.equal(sender.walletBalance,120); assert.equal(sender.totalPoints,170);
    assert.equal(receiver.walletBalance,60); assert.equal(receiver.totalPoints,100);
    results.push('Referral awards each participant exactly 20 points once, retaining independent point balances');

    const service=new RedemptionService(transactional,repo(Redemption),repo(Electrician),repo(Dealer),repo(AppUser),repo(CounterBoy),repo(Wallet),repo(Notification));
    const held=await repo(Wallet).save(repo(Wallet).create({userId:a.id,userRole:'electrician',type:'debit',source:'redemption',amount:10,balanceBefore:120,balanceAfter:110}));
    await repo(Electrician).update(a.id,{walletBalance:110,totalPoints:160});
    const request=await repo(Redemption).save(repo(Redemption).create({userId:a.id,userName:a.name,role:'electrician',type:'bank_transfer',points:10,amount:10,status:'pending',transactionId:held.id,requestedAt:new Date('2026-09-07T18:30:00Z')}));
    await service.updateStatus(request.id,'approved',a.id);
    await service.updateStatus(request.id,'rejected',a.id,'QA rejection');
    await service.updateStatus(request.id,'rejected',a.id,'QA rejection');
    sender=await repo(Electrician).findOneBy({id:a.id}); assert.equal(sender.walletBalance,120);assert.equal(sender.totalPoints,170);
    await service.updateStatus(request.id,'pending',a.id);
    sender=await repo(Electrician).findOneBy({id:a.id});assert.equal(sender.walletBalance,110);assert.equal(sender.totalPoints,160);
    const list=await service.findAll(1,50,undefined,'electrician',a.id,'2026-09-08','2026-09-08',a.electricianCode);
    assert.equal(list.total,1);assert.equal(list.summary.pending.count,1);assert.equal(list.data[0].userPhone,a.phone);
    assert.equal((await service.findAll(1,50,undefined,'electrician',a.id,'2026-09-07','2026-09-07')).total,0);
    await assert.rejects(()=>service.findAll(1,50,undefined,'electrician',undefined,'2026-02-30'));
    results.push('Redemption approve/reject/reopen, single refund, IST day boundaries, search and summary verified');

    const product=await repo(Product).findOne({where:{isActive:true}});assert.ok(product);
    const qr=await repo(QrCode).save(repo(QrCode).create({code:`QA-${randomUUID()}`,productId:product.id,productName:product.name,rewardPoints:5,isScanned:true,scanCount:1,isActive:true,lastScannedBy:a.id}));
    await repo(Scan).save(repo(Scan).create({userId:a.id,userName:a.name,role:'electrician',productId:product.id,productName:product.name,qrCodeId:qr.id,points:5}));
    const qrService=Object.create(QrCodeService.prototype);qrService.dataSource=transactional;
    await qrService.reverseUsage(qr.id,{id:a.id});
    const reusable=await repo(QrCode).findOneBy({id:qr.id});assert.equal(reusable.isScanned,false);assert.equal(reusable.isActive,true);
    assert.equal(await repo(Scan).count({where:{qrCodeId:qr.id}}),0);
    await assert.rejects(()=>qrService.reverseUsage(qr.id,{id:a.id}));
    sender=await repo(Electrician).findOneBy({id:a.id});assert.equal(sender.walletBalance,105);assert.equal(sender.totalPoints,155);
    const mobile=Object.create(MobileService.prototype);mobile.dataSource=transactional;mobile.tierService=Object.create(TierService.prototype);
    const rescanned=await mobile.submitScan(a.id,'electrician',qr.code,'single');
    assert.equal(rescanned.pointsEarned,5);
    sender=await repo(Electrician).findOneBy({id:a.id});assert.equal(sender.walletBalance,110);assert.equal(sender.totalPoints,160);
    assert.equal(await repo(Scan).count({where:{qrCodeId:qr.id}}),1);
    await assert.rejects(()=>mobile.submitScan(a.id,'electrician',qr.code,'single'));
    sender=await repo(Electrician).findOneBy({id:a.id});assert.equal(sender.walletBalance,110);assert.equal(sender.totalPoints,160);
    results.push('Used QR reversal removes old award, reactivates QR, mobile rescan awards once, repeated scan and reversal rejected');
    console.log(JSON.stringify({passed:results.length,results}));
  } finally {
    await runner.rollbackTransaction(); await runner.release(); await ds.destroy();
    console.log('All QA fixtures and mutations rolled back');
  }
})().catch(error=>{console.error(error.stack);process.exit(1)});
