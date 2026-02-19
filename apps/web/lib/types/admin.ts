export type AdminRole = "SUPER_ADMIN" | "MANAGEMENT" | "OPERATOR" | "DISTRIBUTOR";

export type UserStatus = "ACTIVE" | "DISABLED";

export type AdminUser = {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
    regionId: string;
    status: UserStatus;
    lastLoginAt: string;
};

export type PermissionResource = "Planning" | "Operations" | "Executive" | "Administration";

export type Permission = {
    resource: PermissionResource;
    actions: {
        view: boolean;
        create: boolean;
        edit: boolean;
        delete: boolean;
    };
};

export type Factory = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    status: "ACTIVE" | "INACTIVE";
};

export type Warehouse = {
    id: string;
    name: string;
    factoryId?: string;
    capacityTon: number;
    address: string;
    lat: number;
    lng: number;
    status: "ACTIVE" | "INACTIVE";
};

export type DistributorEntity = {
    id: string;
    name: string;
    phone: string;
    address: string;
    lat: number;
    lng: number;
    regionId: string;
    status: "ACTIVE" | "INACTIVE";
};

export type Outlet = {
    id: string;
    distributorId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    status: "ACTIVE" | "INACTIVE";
};

export type ThresholdSetting = {
    id: string;
    warehouseId: string;
    warehouseName: string;
    product: string;
    minStock: number;
    safetyStock: number;
    warningLevel: number;
    criticalLevel: number;
    leadTimeDays: number;
    updatedAt: string;
};

export type AlertSeverity = "Low" | "Medium" | "High";

export type AlertConfig = {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    severity: AlertSeverity;
    recipients: {
        roles: AdminRole[];
        users: string[];
    };
    channels: {
        inApp: boolean;
        email: boolean;
    };
    params: {
        threshold: number;
        unit: string;
    };
};

export type AuditLog = {
    id: string;
    ts: string;
    actorId: string;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    ip: string;
};
