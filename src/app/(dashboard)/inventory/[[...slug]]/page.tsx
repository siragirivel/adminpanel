"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Edit2, Eye, Package, Plus, Search, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";
import "../../spare-styles.css";

function InventoryContent() {
  type PartDraft = {
    localId: number;
    suffix: number;
    name: string;
    seller: string;
    cat: string;
    cost: number;
    sell: number;
    stock: number;
    threshold: number;
  };

  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string[]; // catch-all slug

  const [activeTab, setActiveTab] = useState<"parts" | "add">("parts");
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partToDelete, setPartToDelete] = useState<any | null>(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [isHardEditing, setIsHardEditing] = useState(false);
  const [draftSuffix, setDraftSuffix] = useState<number>(0);
  const [draftCounter, setDraftCounter] = useState(1);
  const [form, setForm] = useState({
    name: "", seller: "", cat: "", cost: 0, sell: 0, stock: 0, threshold: 5
  });
  const [drafts, setDrafts] = useState<PartDraft[]>([]);

  const createDraft = (localId: number): PartDraft => ({
    localId,
    suffix: Math.floor(1000 + Math.random() * 9000),
    name: "",
    seller: "",
    cat: "",
    cost: 0,
    sell: 0,
    stock: 0,
    threshold: 5,
  });

  useEffect(() => {
    setDraftSuffix(Math.floor(1000 + Math.random() * 9000));
  }, []);

  // Handle URL-based state
  useEffect(() => {
    if (!slug || slug.length === 0) {
      setActiveTab("parts");
      setEditId(null);
    } else if (slug[0] === "add-new") {
      setActiveTab("add");
      setEditId(null);
      setIsHardEditing(false);
      setForm({ name: "", seller: "", cat: "", cost: 0, sell: 0, stock: 0, threshold: 5 });
      setDrafts([createDraft(1)]);
      setDraftCounter(2);
    } else {
      // It's an ID (could be multiple segments due to slash)
      const id = slug.join("/");
      setEditId(id);
      setActiveTab("add");
      setIsHardEditing(true);
    }
  }, [slug]);

  const getDynamicId = (name: string, suffix = draftSuffix) => {
    if (!name || !name.trim()) return "Auto-generated";
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, "");
    const pre = (cleanName + "XXX").substring(0, 3).toUpperCase();
    return `Sgv${pre}/${suffix}`;
  };

  const fetchParts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("spare_parts")
      .select("*, profiles!spare_parts_created_by_fkey(username)")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setParts(data);

      // If we have an editId from URL, populate the form
      if (editId) {
        const p = data.find(x => x.id === editId);
        if (p) {
          setForm({
            name: p.name, seller: p.seller, cat: p.cat,
            cost: p.cost, sell: p.sell, stock: p.stock, threshold: p.threshold
          });
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchParts();
  }, [editId]);

  const handlePartNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    if (isHardEditing) {
      setForm(prev => ({ ...prev, name: val }));
      return;
    }

    const existing = parts.find(p => p.name.trim().toLowerCase() === val.trim().toLowerCase());
    if (existing) {
      router.push(`/inventory/${existing.id}`);
    } else {
      setEditId(null);
      setForm(prev => ({ ...prev, name: val }));
    }
  };

  const updateDraftField = (
    localId: number,
    field: keyof Omit<PartDraft, "localId" | "suffix">,
    value: string | number,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId ? { ...draft, [field]: value } : draft,
      ),
    );
  };

  const addAnotherDraft = () => {
    setDrafts((current) => [...current, createDraft(draftCounter)]);
    setDraftCounter((current) => current + 1);
  };

  const removeDraft = (localId: number) => {
    setDrafts((current) => {
      const next = current.filter((draft) => draft.localId !== localId);
      return next.length > 0 ? next : [createDraft(draftCounter)];
    });
    setDraftCounter((current) => current + 1);
  };

  const handleSavePart = async () => {
    if (editId) {
      if (!form.name || !form.cost || !form.sell || !form.seller || !form.cat) {
        alert("Please fill all required fields.");
        return;
      }

      const { error } = await supabase.from("spare_parts").update({
        name: form.name, seller: form.seller, cat: form.cat,
        cost: form.cost, sell: form.sell, stock: form.stock, threshold: form.threshold
      }).eq("id", editId);
      if (error) alert(error.message);
      else {
        await logActivity({
          action: "edit",
          entityType: "spare_part",
          entityId: editId,
          entityLabel: form.name,
          description: "Edited spare part",
          metadata: { seller: form.seller, cat: form.cat, stock: form.stock },
        });
      }
    } else {
      const validDrafts = drafts.filter(
        (draft) =>
          draft.name && draft.cost && draft.sell && draft.seller && draft.cat,
      );

      if (validDrafts.length === 0 || validDrafts.length !== drafts.length) {
        alert("Please fill all required fields for every spare part.");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const rows = validDrafts.map((draft) => ({
        id: getDynamicId(draft.name, draft.suffix),
        name: draft.name,
        seller: draft.seller,
        cat: draft.cat,
        cost: draft.cost,
        sell: draft.sell,
        stock: draft.stock,
        threshold: draft.threshold,
        created_by: user?.id,
      }));
      const { error } = await supabase.from("spare_parts").insert(rows);
      if (error) alert(error.message);
      else {
        for (const row of rows) {
          await logActivity({
            action: "create",
            entityType: "spare_part",
            entityId: row.id,
            entityLabel: row.name,
            description: "Created spare part",
            metadata: { seller: row.seller, cat: row.cat, stock: row.stock },
          });
        }
      }
    }

    setDraftSuffix(Math.floor(1000 + Math.random() * 9000));
    setForm({ name: "", seller: "", cat: "", cost: 0, sell: 0, stock: 0, threshold: 5 });
    setDrafts([createDraft(draftCounter)]);
    setDraftCounter((current) => current + 1);
    setEditId(null);
    setIsHardEditing(false);
    router.push("/inventory");
    fetchParts();
  };

  const navigateToEdit = (p: any) => {
    router.push(`/inventory/${p.id}`);
  };

  const deletePart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const part = parts.find((item) => item.id === id);
    if (part) setPartToDelete(part);
  };

  const confirmDeletePart = async () => {
    if (!partToDelete) return;
    const { error } = await supabase.from("spare_parts").delete().eq("id", partToDelete.id);
    if (error) {
      alert(error.message);
      return;
    }
    await logActivity({
      action: "delete",
      entityType: "spare_part",
      entityId: partToDelete.id,
      entityLabel: partToDelete.name,
      description: "Deleted spare part",
      metadata: { seller: partToDelete.seller, cat: partToDelete.cat },
    });
    setPartToDelete(null);
    fetchParts();
  };

  const filteredParts = parts.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.seller.toLowerCase().includes(q);
    const matchCat = !catFilter || p.cat === catFilter;
    const matchStk = !stockFilter || (stockFilter === 'low' && p.stock > 0 && p.stock <= p.threshold)
      || (stockFilter === 'ok' && p.stock > p.threshold)
      || (stockFilter === 'out' && p.stock === 0);
    return matchQ && matchCat && matchStk;
  });

  const totalParts = parts.length;
  const inStock = parts.filter(p => p.stock > 0).length;
  const lowStock = parts.filter(p => p.stock > 0 && p.stock <= p.threshold).length;
  const inventoryValue = parts.reduce((acc, p) => acc + (p.cost * p.stock), 0);

  const formatMoney = (n: number) => "₹" + Number(n).toLocaleString("en-IN");

  return (
    <div
      className={activeTab === "parts" ? "" : "spare-scope page"}
      style={activeTab === "parts" ? undefined : { margin: "0 auto", padding: "40px" }}
    >

      {/* PARTS TAB */}
      {activeTab === "parts" ? (
      <div className="panel active">
        <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
          <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden">
            <div className="px-8 py-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Spare Parts Inventory</h1>
                <p className="mt-1 text-sm text-slate-500">Manage stock, pricing and low-stock alerts.</p>
              </div>
              <button
                className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
                onClick={() => router.push("/inventory/add-new")}
              >
                <Plus className="w-4 h-4" />
                Add New Part
              </button>
            </div>

            <div className="grid overflow-hidden border-y border-slate-100 bg-slate-50/40 sm:grid-cols-2 xl:grid-cols-4">
              <div className="px-8 py-5 border-b border-slate-100 xl:border-b-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total parts</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{totalParts}</div>
              </div>
              <div className="px-8 py-5 border-b border-slate-100 sm:border-l xl:border-b-0 xl:border-l-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">In stock</div>
                <div className="mt-1 text-2xl font-black text-emerald-600">{inStock}</div>
              </div>
              <div className="px-8 py-5 border-b border-slate-100 xl:border-b-0 xl:border-r">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Low stock</div>
                <div className="mt-1 text-2xl font-black text-amber-600">{lowStock}</div>
              </div>
              <div className="px-8 py-5 sm:border-l xl:border-l-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inventory value</div>
                <div className="mt-1 text-2xl font-black text-indigo-600">{formatMoney(inventoryValue)}</div>
              </div>
            </div>

            <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Inventory Records</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Showing all spare parts in stock</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                  <input
                    type="text"
                    placeholder="Search part, ID or seller..."
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {Array.from(new Set(parts.map(p => p.cat))).filter(Boolean).map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                </select>
                <select
                  className="px-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium text-slate-600 focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value)}
                >
                  <option value="">All stock</option>
                  <option value="low">Low stock</option>
                  <option value="ok">In stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </div>
            </div>

            <div className="px-8 pt-6">
              <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Part ID</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Part</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cost</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Selling</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stock</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-24">
                          <LoadingSpinner label="Retrieving inventory" />
                        </td>
                      </tr>
                    ) : filteredParts.map((p) => {
                      const badgeClass = p.stock === 0 ? "bg-rose-50 text-rose-600" : p.stock <= p.threshold ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600";
                      const badgeTxt = p.stock === 0 ? "Out of stock" : p.stock <= p.threshold ? "Low stock" : "In stock";
                      const pct = Math.round(((p.sell - p.cost) / p.cost) * 100) || 0;

                      return (
                        <tr key={p.id} onClick={() => navigateToEdit(p)} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                          <td className="px-6 py-4">
                            <span className="font-bold text-[12px] text-indigo-600 tracking-tight">{p.id}</span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-slate-900 leading-tight">{p.name}</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              {p.seller} · By {p.profiles?.username || "Admin"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[11px] font-bold text-slate-500">{p.cat}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{formatMoney(p.cost)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{formatMoney(p.sell)}</p>
                            <p className="text-[10px] font-bold text-emerald-600 mt-1">+{pct}%</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-slate-900 tracking-tight">{p.stock}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                              {badgeTxt}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right pr-10">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToEdit(p); }}
                                className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                title="View part"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); navigateToEdit(p); }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover:opacity-100"
                                title="Edit part"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => deletePart(p.id, e)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                                title="Delete part"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredParts.length === 0 && !loading && (
                  <div className="py-20 text-center bg-white">
                    <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold text-slate-800">No parts found</p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCatFilter("");
                        setStockFilter("");
                      }}
                      className="mt-2 text-blue-500 font-bold text-sm hover:underline"
                    >
                      Clear search and filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {partToDelete ? (
        <ConfirmDeleteModal
          title="Delete Part?"
          description={`Delete ${partToDelete.name} (${partToDelete.id}). This action cannot be undone.`}
          confirmLabel="Delete Part"
          onConfirm={() => void confirmDeletePart()}
          onCancel={() => setPartToDelete(null)}
        />
      ) : null}

      {/* ADD PART TAB */}
      {activeTab === "add" ? (
      <div className="panel active">
        <div className="form-heading">
          <h2>{editId ? 'Edit spare part' : 'Add new spare part'}</h2>
          <p>{editId ? `Editing ${editId} — ${form.name}` : 'Fill in multiple spare parts below. Part IDs are auto-generated on save.'}</p>
        </div>
        {editId ? (
        <div className="form-grid">
          <div className="form-field">
            <label className="f-label">Part name <span>*</span></label>
            <input className="f-input" list="part-names-list" autoComplete="off" type="text" placeholder="e.g. Brake Pad Set" value={form.name} onChange={handlePartNameChange} />
            <datalist id="part-names-list">
              {parts.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label className="f-label">Category <span>*</span></label>
            <input className="f-input" list="cat-list" type="text" placeholder="e.g. Engine or Custom" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })} />
            <datalist id="cat-list">
              <option value="Engine" />
              <option value="Brakes" />
              <option value="Filters" />
              <option value="Electrical" />
              <option value="Body" />
              <option value="Tyres" />
              <option value="Lubricants" />
              {Array.from(new Set(parts.map(p => p.cat))).filter(c => !["Engine", "Brakes", "Filters", "Electrical", "Body", "Tyres", "Lubricants"].includes(c as string)).map(c => <option key={c as string} value={c as string} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label className="f-label">Seller / Supplier name <span>*</span></label>
            <input className="f-input" list="supplier-names-list" type="text" placeholder="e.g. Murugan Suppliers" value={form.seller} onChange={e => setForm({ ...form, seller: e.target.value })} />
            <datalist id="supplier-names-list">
              {Array.from(new Set(parts.map(p => p.seller))).map(s => <option key={s as string} value={s as string} />)}
            </datalist>
          </div>
          <div className="form-field">
            <label className="f-label">Part ID <span>(dynamically generated)</span></label>
            <input className="f-input mono" type="text" value={editId || getDynamicId(form.name)} readOnly style={{ color: "var(--accent)", cursor: "not-allowed" }} />
          </div>
          <div className="form-divider"></div>
          <div className="form-field">
            <label className="f-label">Cost price (₹) <span>* purchase price</span></label>
            <div className="rupee-wrap">
              <span className="rupee-sym">₹</span>
              <input className="rupee-input" type="number" min="0" placeholder="0" value={form.cost || ''} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-field">
            <label className="f-label">Selling price (₹) <span>* price to customer</span></label>
            <div className="rupee-wrap">
              <span className="rupee-sym">₹</span>
              <input className="rupee-input" type="number" min="0" placeholder="0" value={form.sell || ''} onChange={e => setForm({ ...form, sell: Number(e.target.value) })} />
            </div>
            {form.cost > 0 && form.sell > 0 && (
              <div className="margin-hint" style={{ color: (form.sell - form.cost) >= 0 ? '#16a34a' : '#dc2626' }}>
                <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Margin: ₹{(form.sell - form.cost).toLocaleString('en-IN')} ({Math.round(((form.sell - form.cost) / form.cost) * 100)}%)</span>
              </div>
            )}
          </div>
          <div className="form-divider"></div>
          <div className="form-field">
            <label className="f-label">Opening stock <span>* units</span></label>
            <input className="f-input mono" type="number" min="0" placeholder="0" value={form.stock || ''} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
          </div>
          <div className="form-field">
            <label className="f-label">Alert stock limit <span>* set warning level</span></label>
            <input className="f-input mono" type="number" min="0" placeholder="5" value={form.threshold || ''} onChange={e => setForm({ ...form, threshold: Number(e.target.value) })} />
            <div className="margin-hint" style={{ color: "#d97706" }}>
              <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span>Low stock alert appears when stock falls below this limit.</span>
            </div>
          </div>
        </div>
        ) : (
        <div className="space-y-6">
          {drafts.map((draft, index) => (
            <div key={draft.localId} className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Spare Part {index + 1}</h3>
                  <p className="mt-1 text-xs text-slate-500">Fill this row and continue with the next part if needed.</p>
                </div>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.localId)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="form-grid">
                <div className="form-field">
                  <label className="f-label">Part name <span>*</span></label>
                  <input className="f-input" type="text" placeholder="e.g. Brake Pad Set" value={draft.name} onChange={e => updateDraftField(draft.localId, "name", e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="f-label">Category <span>*</span></label>
                  <input className="f-input" list={`cat-list-${draft.localId}`} type="text" placeholder="e.g. Engine or Custom" value={draft.cat} onChange={e => updateDraftField(draft.localId, "cat", e.target.value)} />
                  <datalist id={`cat-list-${draft.localId}`}>
                    <option value="Engine" />
                    <option value="Brakes" />
                    <option value="Filters" />
                    <option value="Electrical" />
                    <option value="Body" />
                    <option value="Tyres" />
                    <option value="Lubricants" />
                    {Array.from(new Set(parts.map(p => p.cat))).filter(c => !["Engine", "Brakes", "Filters", "Electrical", "Body", "Tyres", "Lubricants"].includes(c as string)).map(c => <option key={c as string} value={c as string} />)}
                  </datalist>
                </div>
                <div className="form-field">
                  <label className="f-label">Seller / Supplier name <span>*</span></label>
                  <input className="f-input" list={`supplier-list-${draft.localId}`} type="text" placeholder="e.g. Murugan Suppliers" value={draft.seller} onChange={e => updateDraftField(draft.localId, "seller", e.target.value)} />
                  <datalist id={`supplier-list-${draft.localId}`}>
                    {Array.from(new Set(parts.map(p => p.seller))).map(s => <option key={s as string} value={s as string} />)}
                  </datalist>
                </div>
                <div className="form-field">
                  <label className="f-label">Part ID <span>(dynamically generated)</span></label>
                  <input className="f-input mono" type="text" value={getDynamicId(draft.name, draft.suffix)} readOnly style={{ color: "var(--accent)", cursor: "not-allowed" }} />
                </div>
                <div className="form-divider"></div>
                <div className="form-field">
                  <label className="f-label">Cost price (₹) <span>* purchase price</span></label>
                  <div className="rupee-wrap">
                    <span className="rupee-sym">₹</span>
                    <input className="rupee-input" type="number" min="0" placeholder="0" value={draft.cost || ''} onChange={e => updateDraftField(draft.localId, "cost", Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-field">
                  <label className="f-label">Selling price (₹) <span>* price to customer</span></label>
                  <div className="rupee-wrap">
                    <span className="rupee-sym">₹</span>
                    <input className="rupee-input" type="number" min="0" placeholder="0" value={draft.sell || ''} onChange={e => updateDraftField(draft.localId, "sell", Number(e.target.value))} />
                  </div>
                  {draft.cost > 0 && draft.sell > 0 && (
                    <div className="margin-hint" style={{ color: (draft.sell - draft.cost) >= 0 ? '#16a34a' : '#dc2626' }}>
                      <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>Margin: ₹{(draft.sell - draft.cost).toLocaleString('en-IN')} ({Math.round(((draft.sell - draft.cost) / draft.cost) * 100)}%)</span>
                    </div>
                  )}
                </div>
                <div className="form-divider"></div>
                <div className="form-field">
                  <label className="f-label">Opening stock <span>* units</span></label>
                  <input className="f-input mono" type="number" min="0" placeholder="0" value={draft.stock || ''} onChange={e => updateDraftField(draft.localId, "stock", Number(e.target.value))} />
                </div>
                <div className="form-field">
                  <label className="f-label">Alert stock limit <span>* set warning level</span></label>
                  <input className="f-input mono" type="number" min="0" placeholder="5" value={draft.threshold || ''} onChange={e => updateDraftField(draft.localId, "threshold", Number(e.target.value))} />
                  <div className="margin-hint" style={{ color: "#d97706" }}>
                    <svg fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    <span>Low stock alert appears when stock falls below this limit.</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addAnotherDraft}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-3 text-sm font-semibold text-indigo-600 transition-all hover:bg-indigo-50"
          >
            <Plus className="w-4 h-4" />
            Add another spare part
          </button>
        </div>
        )}
        <div className="form-actions">
          <button className="btn-save" onClick={handleSavePart}>
            <svg fill="none" viewBox="0 0 16 16"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5l-3-3z" stroke="currentColor" strokeWidth="1.3" /><path d="M9 2v3H5V2M5 9h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            {editId ? "Save part" : `Save ${drafts.length} part${drafts.length > 1 ? "s" : ""}`}
          </button>
          <button className="btn-cancel-form" onClick={() => router.push("/inventory")}>Cancel</button>
        </div>
      </div>
      ) : null}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InventoryContent />
    </Suspense>
  );
}
