import { Request, Response } from 'express';
export declare const issueBonds: (req: Request, res: Response) => Promise<void>;
export declare const refundExpiredBondsForUser: (userId: string) => Promise<number>;
export declare const getActiveBonds: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=bonds.controller.d.ts.map