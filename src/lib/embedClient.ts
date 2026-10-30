/**
 * Embed Supabase Client - chainable API that routes queries through embed-proxy
 * Mimics the supabase-js client API for transparent usage in components.
 */
import { supabase } from "@/integrations/supabase/client";

interface Filter {
  field: string;
  op: string;
  value: any;
}

interface OrderBy {
  field: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

interface EmbedQueryResult {
  data: any;
  error: any;
  count?: number | null;
}

class EmbedQueryBuilder {
  private token: string;
  private table: string;
  private operation: "select" | "insert" | "update" | "delete" | "count";
  private selectStr: string = "*";
  private filters: Filter[] = [];
  private orderClauses: OrderBy[] = [];
  private rangeValues?: [number, number];
  private insertData?: any;
  private updateData?: any;
  private headMode: boolean = false;
  private countMode?: "exact" | "planned" | "estimated";
  private singleMode: boolean = false;

  constructor(token: string, table: string, operation: "select" | "insert" | "update" | "delete" | "count") {
    this.token = token;
    this.table = table;
    this.operation = operation;
  }

  select(columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (columns) this.selectStr = columns;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = true;
    return this;
  }

  eq(field: string, value: any) { this.filters.push({ field, op: "eq", value }); return this; }
  neq(field: string, value: any) { this.filters.push({ field, op: "neq", value }); return this; }
  gt(field: string, value: any) { this.filters.push({ field, op: "gt", value }); return this; }
  gte(field: string, value: any) { this.filters.push({ field, op: "gte", value }); return this; }
  lt(field: string, value: any) { this.filters.push({ field, op: "lt", value }); return this; }
  lte(field: string, value: any) { this.filters.push({ field, op: "lte", value }); return this; }
  in(field: string, values: any[]) { this.filters.push({ field, op: "in", value: values }); return this; }
  is(field: string, value: any) { this.filters.push({ field, op: "is", value }); return this; }
  like(field: string, value: string) { this.filters.push({ field, op: "like", value }); return this; }
  ilike(field: string, value: string) { this.filters.push({ field, op: "ilike", value }); return this; }

  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderClauses.push({
      field,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst ?? false,
    });
    return this;
  }

  range(from: number, to: number) {
    this.rangeValues = [from, to];
    return this;
  }

  limit(count: number) {
    // Implement limit as range if no range set
    if (!this.rangeValues) {
      this.rangeValues = [0, count - 1];
    }
    return this;
  }

  single() {
    this.singleMode = true;
    return this;
  }

  insert(data: any) {
    this.operation = "insert";
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.operation = "update";
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  async then(resolve: (value: EmbedQueryResult) => void, reject?: (reason: any) => void): Promise<void> {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else resolve({ data: null, error: err });
    }
  }

  private async execute(): Promise<EmbedQueryResult> {
    const body: any = {
      token: this.token,
      operation: this.headMode && this.countMode ? "count" : this.operation,
      table: this.table,
    };

    if (this.selectStr !== "*") body.select = this.selectStr;
    if (this.filters.length > 0) body.filters = this.filters;
    if (this.orderClauses.length > 0) body.order = this.orderClauses;
    if (this.rangeValues) body.range = this.rangeValues;
    if (this.headMode) body.head = true;
    if (this.countMode) body.count = this.countMode;

    if (this.operation === "insert") body.data = this.insertData;
    if (this.operation === "update") body.data = this.updateData;

    const { data, error } = await supabase.functions.invoke("embed-proxy", { body });

    if (error) {
      return { data: null, error };
    }

    if (data?.error) {
      return { data: null, error: { message: data.error } };
    }

    let resultData = data?.data ?? null;
    const resultCount = data?.count ?? null;

    if (this.singleMode && Array.isArray(resultData)) {
      if (resultData.length === 0) {
        return { data: null, error: { message: "No rows found", code: "PGRST116" } };
      }
      resultData = resultData[0];
    }

    return { data: resultData, error: null, count: resultCount };
  }
}

class EmbedRpcBuilder {
  private token: string;
  private rpcName: string;
  private rpcParams: Record<string, any>;

  constructor(token: string, rpcName: string, params: Record<string, any>) {
    this.token = token;
    this.rpcName = rpcName;
    this.rpcParams = params;
  }

  async then(resolve: (value: EmbedQueryResult) => void, reject?: (reason: any) => void): Promise<void> {
    try {
      const { data, error } = await supabase.functions.invoke("embed-proxy", {
        body: {
          token: this.token,
          operation: "rpc",
          table: "",
          rpc_name: this.rpcName,
          rpc_params: this.rpcParams,
        },
      });

      if (error) {
        resolve({ data: null, error });
      } else if (data?.error) {
        resolve({ data: null, error: { message: data.error } });
      } else {
        resolve({ data: data?.data, error: null });
      }
    } catch (err) {
      if (reject) reject(err);
      else resolve({ data: null, error: err });
    }
  }
}

/**
 * Creates a Supabase-compatible client that routes all queries through embed-proxy.
 * Usage is identical to supabase client:
 * 
 * ```ts
 * const client = createEmbedClient(token);
 * const { data } = await client.from('workflows').select('*').eq('seller_id', sellerId);
 * ```
 */
export function createEmbedClient(token: string) {
  return {
    from(table: string) {
      const builder = new EmbedQueryBuilder(token, table, "select");
      return {
        select(columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
          builder.select(columns, options);
          return builder;
        },
        insert(data: any) {
          const insertBuilder = new EmbedQueryBuilder(token, table, "insert");
          insertBuilder.insert(data);
          return {
            select(columns?: string) {
              if (columns) insertBuilder.select(columns);
              return insertBuilder;
            },
            single() { insertBuilder.single(); return insertBuilder; },
            then: (resolve: any, reject?: any) => insertBuilder.then(resolve, reject),
          };
        },
        update(data: any) {
          const updateBuilder = new EmbedQueryBuilder(token, table, "update");
          updateBuilder.update(data);
          return {
            eq(field: string, value: any) { updateBuilder.eq(field, value); return this; },
            select(columns?: string) {
              if (columns) updateBuilder.select(columns);
              return updateBuilder;
            },
            single() { updateBuilder.single(); return updateBuilder; },
            then: (resolve: any, reject?: any) => updateBuilder.then(resolve, reject),
          };
        },
        delete() {
          const deleteBuilder = new EmbedQueryBuilder(token, table, "delete");
          deleteBuilder.delete();
          return {
            eq(field: string, value: any) { deleteBuilder.eq(field, value); return this; },
            select(columns?: string) {
              if (columns) deleteBuilder.select(columns);
              return deleteBuilder;
            },
            then: (resolve: any, reject?: any) => deleteBuilder.then(resolve, reject),
          };
        },
      };
    },
    rpc(name: string, params: Record<string, any> = {}) {
      return new EmbedRpcBuilder(token, name, params);
    },
    // Stubs for features not available in embed mode
    channel(_name: string) {
      return {
        on: (_event: any, _config: any, _callback: any) => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
        subscribe: () => ({}),
      };
    },
    removeChannel(_channel: any) { /* no-op */ },
    functions: supabase.functions, // Edge functions still work directly
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  };
}

export type EmbedClient = ReturnType<typeof createEmbedClient>;
