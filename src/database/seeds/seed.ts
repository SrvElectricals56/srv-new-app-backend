import 'dotenv/config';
import { Admin } from '../entities/admin.entity';
import { AdminRole } from '../../common/enums';
import AppDataSource from '../data-source';

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log('✅ PostgreSQL Database connected successfully');

    const adminRepository = AppDataSource.getRepository(Admin);

    const defaultAdminEmail =
      process.env.DEFAULT_ADMIN_EMAIL || 'admin@srvelectricals.com';

    // Check if admin already exists
    const existingAdmin = await adminRepository.findOne({
      where: { email: defaultAdminEmail },
    });

    if (!existingAdmin) {
      const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      if (!defaultAdminPassword) {
        throw new Error(
          'DEFAULT_ADMIN_PASSWORD is required when creating the initial admin.',
        );
      }

      // Create default admin
      const admin = adminRepository.create({
        email: defaultAdminEmail,
        password: defaultAdminPassword,
        name: 'Super Admin',
        role: AdminRole.SUPER_ADMIN,
        phone: '+91-9876543210',
        isActive: true,
      });

      await adminRepository.save(admin);
      console.log('✅ Default admin created successfully');
      console.log('📧 Email: admin@srvelectricals.com');
      console.log('🔑 Password: configured through DEFAULT_ADMIN_PASSWORD');
    } else {
      console.log('ℹ️  Default admin already exists');
    }

    await AppDataSource.destroy();
    console.log('🎉 Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.log('\n💡 Make sure PostgreSQL is running and database "srv_admin" exists');
    console.log('💡 Create database: CREATE DATABASE srv_admin;');
    process.exit(1);
  }
}

seed();
