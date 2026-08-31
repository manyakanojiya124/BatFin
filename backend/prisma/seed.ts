import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_PHONE = "+919876543210";
const DEMO_OTP = "123456";
const DEMO_ASSET_SERIALS = ["BAT-L5-2026-0001", "VEH-2W-2026-0002"];

const plans = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Daily Flex",
    type: "PREPAID",
    billingCycle: "DAILY",
    minimumBalance: 250,
    creditLimit: null,
    pricePerKm: 2.8,
    pricePerKwh: 12,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Weekly Saver",
    type: "PREPAID",
    billingCycle: "WEEKLY",
    minimumBalance: 500,
    creditLimit: null,
    pricePerKm: 2.5,
    pricePerKwh: 11.5,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Monthly Value",
    type: "PREPAID",
    billingCycle: "MONTHLY",
    minimumBalance: 1000,
    creditLimit: null,
    pricePerKm: 2.2,
    pricePerKwh: 10.75,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Prepaid Flexible",
    type: "PREPAID",
    billingCycle: "FLEXIBLE",
    minimumBalance: 300,
    creditLimit: null,
    pricePerKm: 2.75,
    pricePerKwh: 11.8,
  },
  {
    id: "20000000-0000-4000-8000-000000000001",
    name: "3 Day Credit",
    type: "POSTPAID",
    billingCycle: "3_DAYS",
    minimumBalance: null,
    creditLimit: 1500,
    pricePerKm: 3,
    pricePerKwh: 12.5,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    name: "7 Day Credit",
    type: "POSTPAID",
    billingCycle: "7_DAYS",
    minimumBalance: null,
    creditLimit: 2500,
    pricePerKm: 2.9,
    pricePerKwh: 12.25,
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    name: "15 Day Credit",
    type: "POSTPAID",
    billingCycle: "15_DAYS",
    minimumBalance: null,
    creditLimit: 5000,
    pricePerKm: 2.6,
    pricePerKwh: 11.75,
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    name: "30 Day Pro",
    type: "POSTPAID",
    billingCycle: "30_DAYS",
    minimumBalance: null,
    creditLimit: 10000,
    pricePerKm: 2.3,
    pricePerKwh: 11,
  },
] as const;

function daysAgo(days: number, hours = 0) {
  return new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000);
}

async function seed() {
  const result = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.upsert({
      where: { phone: DEMO_PHONE },
      update: {
        name: "Sarah Jenkins",
        email: "sarah@example.com",
        address: "Connaught Place, New Delhi",
        accountStatus: "active",
      },
      create: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Sarah Jenkins",
        phone: DEMO_PHONE,
        email: "sarah@example.com",
        address: "Connaught Place, New Delhi",
        accountStatus: "active",
      },
    });

    await transaction.subscription.deleteMany({ where: { userId: user.id } });
    await transaction.transaction.deleteMany({
      where: { userId: user.id, originalTransactionId: { not: null } },
    });
    await transaction.transaction.deleteMany({ where: { userId: user.id } });
    await transaction.supportTicket.deleteMany({ where: { userId: user.id } });
    await transaction.asset.deleteMany({
      where: {
        userId: user.id,
        serialNumber: { notIn: [...DEMO_ASSET_SERIALS] },
      },
    });

    const battery = await transaction.asset.upsert({
      where: { serialNumber: DEMO_ASSET_SERIALS[0] },
      update: {
        userId: user.id,
        assetType: "battery",
        productType: "Battery L5",
        vehicleNumber: null,
        status: "active",
        latitude: 28.6315,
        longitude: 77.2167,
        batteryLevel: 78,
        temperature: 32.4,
      },
      create: {
        id: "00000000-0000-4000-8000-000000000101",
        userId: user.id,
        assetType: "battery",
        productType: "Battery L5",
        serialNumber: DEMO_ASSET_SERIALS[0],
        status: "active",
        latitude: 28.6315,
        longitude: 77.2167,
        batteryLevel: 78,
        temperature: 32.4,
      },
    });

    const vehicle = await transaction.asset.upsert({
      where: { serialNumber: DEMO_ASSET_SERIALS[1] },
      update: {
        userId: user.id,
        assetType: "vehicle",
        productType: "Electric 2 Wheeler",
        vehicleNumber: "DL 1ER 4567",
        status: "active",
        latitude: 28.6321,
        longitude: 77.2182,
        batteryLevel: 85,
        temperature: 30.8,
      },
      create: {
        id: "00000000-0000-4000-8000-000000000102",
        userId: user.id,
        assetType: "vehicle",
        productType: "Electric 2 Wheeler",
        serialNumber: DEMO_ASSET_SERIALS[1],
        vehicleNumber: "DL 1ER 4567",
        status: "active",
        latitude: 28.6321,
        longitude: 77.2182,
        batteryLevel: 85,
        temperature: 30.8,
      },
    });

    for (const plan of plans) {
      await transaction.plan.upsert({
        where: { id: plan.id },
        update: { ...plan, status: "active" },
        create: { ...plan, status: "active" },
      });
    }

    await transaction.transaction.createMany({
      data: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          userId: user.id,
          assetId: battery.id,
          type: "CHARGING",
          amount: 150,
          direction: "DEBIT",
          description: "Station #42, Connaught Place",
          transactionDate: daysAgo(0, 1),
        },
        {
          id: "30000000-0000-4000-8000-000000000002",
          userId: user.id,
          type: "PAYMENT",
          amount: 5000,
          direction: "CREDIT",
          description: "Wallet recharge via UPI · Ref SEED-UPI-5000",
          providerReference: "SEED-UPI-5000",
          paymentMethod: "UPI",
          source: "customer_payment",
          transactionDate: daysAgo(0, 5),
        },
        {
          id: "30000000-0000-4000-8000-000000000003",
          userId: user.id,
          assetId: battery.id,
          type: "PENALTY",
          amount: 50,
          direction: "DEBIT",
          description: "Late return · Battery L5",
          transactionDate: daysAgo(1),
        },
        {
          id: "30000000-0000-4000-8000-000000000004",
          userId: user.id,
          assetId: battery.id,
          type: "RENTAL",
          amount: 2500,
          direction: "DEBIT",
          description: "Monthly lease payment",
          transactionDate: daysAgo(1, 8),
        },
        {
          id: "30000000-0000-4000-8000-000000000005",
          userId: user.id,
          type: "PAYMENT",
          amount: 10000,
          direction: "CREDIT",
          description: "Wallet recharge via NET_BANKING · Ref SEED-BANK-10000",
          providerReference: "SEED-BANK-10000",
          paymentMethod: "NET_BANKING",
          source: "customer_payment",
          transactionDate: daysAgo(3),
        },
        {
          id: "30000000-0000-4000-8000-000000000006",
          userId: user.id,
          type: "REFUND",
          amount: 500,
          direction: "CREDIT",
          description: "Security adjustment refund",
          transactionDate: daysAgo(5),
        },
        {
          id: "30000000-0000-4000-8000-000000000007",
          userId: user.id,
          assetId: vehicle.id,
          type: "INSURANCE",
          amount: 200,
          direction: "DEBIT",
          description: "Vehicle protection cover",
          transactionDate: daysAgo(7),
        },
        {
          id: "30000000-0000-4000-8000-000000000008",
          userId: user.id,
          assetId: battery.id,
          type: "CHARGING",
          amount: 150,
          direction: "DEBIT",
          description: "Station #18, Karol Bagh",
          transactionDate: daysAgo(9),
        },
        {
          id: "30000000-0000-4000-8000-000000000009",
          userId: user.id,
          type: "DEPOSIT",
          amount: 250,
          direction: "CREDIT",
          description: "Promotional wallet credit",
          transactionDate: daysAgo(11),
        },
        {
          id: "30000000-0000-4000-8000-000000000010",
          userId: user.id,
          assetId: vehicle.id,
          type: "PARKING",
          amount: 250,
          direction: "DEBIT",
          description: "Mobility hub parking",
          transactionDate: daysAgo(13),
        },
      ],
    });

    return {
      userId: user.id,
      assetCount: 2,
      planCount: plans.length,
      transactionCount: 10,
    };
  });

  console.log("BatFIN demo database seeded successfully.");
  console.log(`Demo user ID: ${result.userId}`);
  console.log(`Demo phone: ${DEMO_PHONE}`);
  console.log(`Development OTP: ${DEMO_OTP}`);
  console.log(
    `Created ${result.assetCount} assets, ${result.planCount} plans, and ${result.transactionCount} transactions.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Unable to seed BatFIN demo data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
