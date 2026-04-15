export type Store = "keells" | "glomark" | "cargills";

export type ProductUnit = "g" | "kg" | "unit" | "unknown";

export type SourceStatus = "ok" | "partial" | "blocked_or_unstable" | "not_found";

export type NormalizedProduct = {
  id: string;
  store: Store;
  source_url: string;
  source_product_id: string | null;
  source_category: "meat";
  captured_at: string;
  source_status: SourceStatus;
  name: string;
  displayed_price_lkr: number | null;
  displayed_currency: "LKR";
  in_stock: boolean | null;
  pack_qty: number | null;
  pack_unit: ProductUnit;
  net_weight_g: number | null;
  price_per_kg_lkr: number | null;
  raw_size_text: string | null;
  notes: string | null;
};

export type ParsedPackSize = {
  pack_qty: number | null;
  pack_unit: ProductUnit;
  net_weight_g: number | null;
  raw_size_text: string | null;
};

export type ImportedSnapshotMode = "browser_assisted" | "worker_fetch";

export type KeellsImportedSnapshotItem = {
  id: string;
  source_product_id: string | null;
  name: string;
  source_url: string;
  displayed_price_lkr: number | null;
  raw_size_text: string | null;
  in_stock: boolean | null;
  notes?: string | null;
};

export type KeellsImportedSnapshot = {
  provider: "keells";
  category: "meat";
  extraction_mode: ImportedSnapshotMode;
  captured_at: string;
  source_status: SourceStatus;
  items: KeellsImportedSnapshotItem[];
};

export type GlomarkImportedSnapshotItem = {
  id: string;
  source_product_id: string | null;
  name: string;
  source_url: string;
  displayed_price_lkr: number | null;
  raw_size_text: string | null;
  in_stock: boolean | null;
  brand: string | null;
  sub_category: string | null;
  notes?: string | null;
};

export type GlomarkImportedSnapshot = {
  provider: "glomark";
  category: "meat";
  extraction_mode: ImportedSnapshotMode;
  captured_at: string;
  source_status: SourceStatus;
  items: GlomarkImportedSnapshotItem[];
};

export type CargillsImportedSnapshotItem = {
  id: string;
  source_product_id: string | null;
  name: string;
  source_url: string;
  displayed_price_lkr: number | null;
  raw_size_text: string | null;
  in_stock: boolean | null;
  sku_code: string | null;
  category_code: string | null;
  notes?: string | null;
};

export type CargillsImportedSnapshot = {
  provider: "cargills";
  category: "meat";
  extraction_mode: ImportedSnapshotMode;
  captured_at: string;
  source_status: SourceStatus;
  items: CargillsImportedSnapshotItem[];
};
