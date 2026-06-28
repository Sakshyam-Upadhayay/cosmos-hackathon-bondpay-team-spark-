import { Pool } from 'pg';
export declare const pool: Pool;
export declare const query: (text: string, params?: any[]) => Promise<any>;
export declare const withTransaction: <T>(callback: (txQuery: (text: string, params?: any[]) => Promise<any>) => Promise<T>) => Promise<T>;
//# sourceMappingURL=db.d.ts.map