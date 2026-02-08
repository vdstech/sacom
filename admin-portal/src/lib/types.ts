export type MePayload = {
  user: {
    id: string;
    email: string;
    name: string;
    systemLevel: string;
    isSystemUser: boolean;
    disabled: boolean;
  };
  roles: Array<{
    id: string;
    name: string;
    description: string;
    systemLevel: string;
    isSystemRole: boolean;
  }>;
  permissions: string[];
  systemLevel: string;
};

export type MenuItem = {
  href: string;
  label: string;
  anyOf: string[];
};
