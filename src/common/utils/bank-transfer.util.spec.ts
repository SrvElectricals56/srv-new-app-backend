import { hasBankTransferDestination } from './bank-transfer.util';

describe('hasBankTransferDestination', () => {
  it('accepts a linked UPI destination without requiring a QR image', () => {
    expect(hasBankTransferDestination({
      bankLinked: true,
      accountHolderName: 'Poonam',
      upiId: 'poonam@upi',
    })).toBe(true);
  });

  it('accepts a linked bank or payment account without a UPI ID', () => {
    expect(hasBankTransferDestination({
      bankLinked: true,
      accountHolderName: 'Poonam',
      bankAccount: '9876545081',
    })).toBe(true);
  });

  it('rejects an account with no usable transfer destination', () => {
    expect(hasBankTransferDestination({
      bankLinked: true,
      accountHolderName: 'Poonam',
    })).toBe(false);
  });
});
