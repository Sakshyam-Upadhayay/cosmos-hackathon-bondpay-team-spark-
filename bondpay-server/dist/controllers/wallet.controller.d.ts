import { Request, Response } from 'express';
export declare const topup: (req: Request, res: Response) => Promise<void>;
export declare const transferOnline: (req: Request, res: Response) => Promise<void>;
export declare const reverseBonds: (req: Request, res: Response) => Promise<void>;
export declare const getHistory: (req: Request, res: Response) => Promise<void>;
export declare const transferPending: (req: Request, res: Response) => Promise<void>;
export declare const claimPending: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=wallet.controller.d.ts.map