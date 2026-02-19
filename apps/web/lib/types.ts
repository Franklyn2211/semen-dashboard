export type Role = "ADMIN" | "OPS" | "EXEC";

export type Me = {
    id: number;
    name: string;
    email: string;
    role: Role;
};
