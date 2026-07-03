import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { Admin } from '../../database/entities/admin.entity';
import { AdminPermission } from '../../database/entities/admin-permission.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(AdminPermission)
    private adminPermissionRepository: Repository<AdminPermission>,
  ) {}

  async create(createAdminDto: CreateAdminDto) {
    const existingAdmin = await this.adminRepository.findOne({
      where: { email: createAdminDto.email },
    });

    if (existingAdmin) {
      throw new ConflictException('Admin with this email already exists');
    }

    const admin = this.adminRepository.create(createAdminDto);
    const savedAdmin = await this.adminRepository.save(admin);
    
    const { password, ...result } = savedAdmin;
    return result;
  }

  async findAll(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? [
          { name: Like(`%${search}%`) },
          { email: Like(`%${search}%`) },
        ]
      : {};

    const [data, total] = await this.adminRepository.findAndCount({
      where,
      skip,
      take: limit,
      select: ['id', 'email', 'name', 'role', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const admin = await this.adminRepository.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'role', 'phone', 'isActive', 'lastLoginAt', 'createdAt'],
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  async update(id: string, updateAdminDto: UpdateAdminDto) {
    // First, get the full admin entity (including password field)
    const admin = await this.adminRepository.findOne({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (updateAdminDto.email && updateAdminDto.email !== admin.email) {
      const existingAdmin = await this.adminRepository.findOne({
        where: { email: updateAdminDto.email },
      });

      if (existingAdmin) {
        throw new ConflictException('Admin with this email already exists');
      }
    }

    const passwordChanged =
      typeof updateAdminDto.password === 'string' &&
      updateAdminDto.password.trim().length > 0;

    if (passwordChanged) {
      admin.tokenVersion = (admin.tokenVersion ?? 0) + 1;
      admin.refreshToken = null;
    }

    // Merge the updates into the entity
    Object.assign(admin, updateAdminDto);

    // Save the entity (this will trigger @BeforeUpdate hook for password hashing)
    const savedAdmin = await this.adminRepository.save(admin);

    // Return without password field
    const { password, ...result } = savedAdmin;
    return result;
  }

  async remove(id: string) {
    const admin = await this.findOne(id);
    await this.adminRepository.remove(admin);
    return { message: 'Admin deleted successfully' };
  }

  // Permission Management Methods
  async getPermissions(adminId: string) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Super admin always has all permissions
    if (admin.role === 'super_admin') {
      return { role: 'super_admin', permissions: [] };
    }

    const permissions = await this.adminPermissionRepository.find({
      where: { adminId },
      select: {
        module: true,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
      },
    });

    return { role: admin.role, permissions };
  }

  async updatePermissions(adminId: string, updatePermissionsDto: UpdatePermissionsDto) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Cannot modify super admin permissions
    if (admin.role === 'super_admin') {
      throw new ConflictException('Cannot modify super admin permissions');
    }

    // Delete existing permissions
    await this.adminPermissionRepository.delete({ adminId });

    // Create new permissions
    const permissions = updatePermissionsDto.permissions.map((perm) => ({
      adminId: adminId,
      module: perm.module,
      canView: perm.canView ?? false,
      canCreate: perm.canCreate ?? false,
      canEdit: perm.canEdit ?? false,
      canDelete: perm.canDelete ?? false,
      canExport: perm.canExport ?? false,
    }));

    if (permissions.length > 0) {
      await this.adminPermissionRepository.save(
        this.adminPermissionRepository.create(permissions),
      );
    }

    return this.getPermissions(adminId);
  }

}
