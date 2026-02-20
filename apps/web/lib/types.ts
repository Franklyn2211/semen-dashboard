export type Role =
    | "SUPER_ADMIN"
    | "MANAGEMENT"
    | "OPERATOR"
    | "DISTRIBUTOR";

export type Me = {
    id: number;
    name: string;
    email: string;
    role: Role;
};
