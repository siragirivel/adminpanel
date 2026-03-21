"use client";

import React, { useState, useEffect, Suspense } from "react";
import { 
  Car, 
  Search, 
  Plus, 
  Phone, 
  Calendar,
  X,
  Upload,
  Eye,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Save,
  Image as ImageIcon,
  Loader2,
  Edit2,
  ArrowLeft,
  MapPin,
  History,
  Wrench,
  Receipt,
  User,
  Share2,
  MoreVertical,
  Camera
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { cn, createInvoiceNumber, createQuotationNumber, createVehicleId } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  VehicleRegistrationForm,
  type VehicleImageKey,
  type VehicleRegistrationFormData,
} from "@/components/VehicleRegistrationForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ConfirmDeleteModal } from "@/components/ConfirmDeleteModal";
import { logActivity } from "@/lib/activity-log";
import { generateInvoicePDF } from "@/lib/pdf-service";
import {
  VehicleProfileView,
  type VehicleInvoiceRecord,
} from "@/components/VehicleProfileView";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import "../../spare-styles.css";

interface Vehicle {
  id: string; // uuid
  car_id: string; // SGV-YYYY-XXX
  owner_name: string;
  phone_number: string;
  alternate_phone?: string;
  vehicle_reg: string;
  entry_date: string;
  make_model?: string;
  status: string;
  work_description?: string;
  chassis_number?: string;
  front_image_url?: string;
  back_image_url?: string;
  chassis_image_url?: string;
  created_at?: string;
}

interface VehicleWithProfile extends Vehicle {
  profiles?: {
    username?: string;
  } | null;
}

const COMMON_MAKES = [
  "Ashok Leyland",
  "Bajaj",
  "Chevrolet",
  "Ford",
  "Hero",
  "Honda",
  "Hyundai",
  "Kia",
  "Mahindra",
  "Maruti Suzuki",
  "Nissan",
  "Renault",
  "Royal Enfield",
  "Suzuki",
  "Tata",
  "TVS",
  "Toyota",
  "Volkswagen",
  "Yamaha",
];

const COMMON_MODELS_BY_MAKE: Record<string, string[]> = {
  "Ashok Leyland": ["Dost", "Bada Dost", "Partner"],
  Bajaj: ["Pulsar 150", "Pulsar 220", "CT 110", "Discover", "RE Compact"],
  Chevrolet: ["Beat", "Spark", "Cruze", "Enjoy"],
  Ford: ["EcoSport", "Figo", "Aspire", "Endeavour"],
  Hero: ["Splendor Plus", "HF Deluxe", "Passion Pro", "Xtreme 125R"],
  Honda: ["Activa 6G", "Shine", "City", "Amaze", "WR-V"],
  Hyundai: ["i10", "Grand i10", "i20", "Venue", "Creta", "Verna"],
  Kia: ["Seltos", "Sonet", "Carens"],
  Mahindra: ["Bolero", "Scorpio", "XUV300", "XUV700", "Thar"],
  "Maruti Suzuki": ["Swift", "Dzire", "Alto", "WagonR", "Ertiga", "Baleno"],
  Nissan: ["Magnite", "Micra", "Sunny"],
  Renault: ["Kwid", "Triber", "Kiger", "Duster"],
  "Royal Enfield": ["Classic 350", "Bullet 350", "Hunter 350", "Meteor 350"],
  Suzuki: ["Access 125", "Burgman Street", "Gixxer"],
  Tata: ["Tiago", "Tigor", "Punch", "Nexon", "Harrier"],
  TVS: ["Jupiter", "XL100", "Apache RTR 160", "Ntorq 125"],
  Toyota: ["Innova", "Glanza", "Urban Cruiser", "Fortuner"],
  Volkswagen: ["Polo", "Vento", "Taigun", "Virtus"],
  Yamaha: ["FZ-S", "R15", "Fascino 125", "RayZR"],
};

function parseStoredMakeModel(value?: string | null) {
  const raw = value?.trim();
  if (!raw) {
    return { make: "", model: "" };
  }

  const matchedMake = Object.keys(COMMON_MODELS_BY_MAKE).find((make) =>
    raw.toLowerCase().startsWith(make.toLowerCase()),
  );

  if (matchedMake) {
    return {
      make: matchedMake,
      model: raw.slice(matchedMake.length).trim(),
    };
  }

  const [firstWord, ...rest] = raw.split(/\s+/);
  return {
    make: firstWord || raw,
    model: rest.join(" "),
  };
}

function VehiclesContent() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string[] | undefined;
  
  const [viewMode, setViewMode] = useState<'list' | 'new' | 'profile'>('list');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleWithProfile | null>(null);
  const [nextCarId, setNextCarId] = useState("");
  const [vehicleInvoices, setVehicleInvoices] = useState<VehicleInvoiceRecord[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");

  // Form State
  const [formData, setFormData] = useState<VehicleRegistrationFormData>({
    owner_name: "",
    phone_number: "",
    owner_address: "",
    vehicle_reg: "",
    entry_date: format(new Date(), "yyyy-MM-dd"),
    vehicle_type: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_color: "",
    entry_note: "",
    make_model: "",
    status: "In Service",
    work_description: "",
    chassis_number: "",
  });

  const [images, setImages] = useState<Record<VehicleImageKey, File | null>>({
    front: null as File | null,
    back: null as File | null,
    chassis: null as File | null,
  });
  const [imageUrls, setImageUrls] = useState<Record<VehicleImageKey, string | null>>({
    front: null,
    back: null,
    chassis: null,
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const makeSuggestions = React.useMemo(() => {
    const values = new Set<string>(COMMON_MAKES);

    vehicles.forEach((vehicle) => {
      const parsed = parseStoredMakeModel(vehicle.make_model);
      if (parsed.make) {
        values.add(parsed.make);
      }
    });

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const modelSuggestions = React.useMemo(() => {
    const values = new Set<string>();
    const normalizedMake = formData.vehicle_make.trim().toLowerCase();

    if (normalizedMake) {
      Object.entries(COMMON_MODELS_BY_MAKE).forEach(([make, models]) => {
        if (make.toLowerCase().includes(normalizedMake) || normalizedMake.includes(make.toLowerCase())) {
          models.forEach((model) => values.add(model));
        }
      });
    } else {
      Object.values(COMMON_MODELS_BY_MAKE).forEach((models) => {
        models.forEach((model) => values.add(model));
      });
    }

    vehicles.forEach((vehicle) => {
      const parsed = parseStoredMakeModel(vehicle.make_model);
      if (!parsed.model) return;
      if (!normalizedMake || parsed.make.toLowerCase() === normalizedMake) {
        values.add(parsed.model);
      }
    });

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [formData.vehicle_make, vehicles]);

  useEffect(() => {
    fetchVehicles();
  }, []);

  // Sync state with URL
  useEffect(() => {
    if (!slug || slug.length === 0) {
      setViewMode('list');
      setCurrentVehicle(null);
      setEditingId(null);
    } else if (slug[0] === 'add-new') {
      setViewMode('new');
      setEditingId(null);
      resetForm();
      void fetchNextCarId();
    } else if (slug[0] === 'edit' && slug[1]) {
      setViewMode('new');
      setEditingId(slug[1]);
      fetchVehicleForEdit(slug[1]);
    } else {
      const carRef = slug.join('/');
      fetchVehicleProfile(carRef);
    }
  }, [slug]);

  const resetForm = () => {
    setFormData({
        owner_name: "",
        phone_number: "",
        owner_address: "",
        vehicle_reg: "",
        entry_date: format(new Date(), "yyyy-MM-dd"),
        vehicle_type: "",
        vehicle_make: "",
        vehicle_model: "",
        vehicle_year: "",
        vehicle_color: "",
        entry_note: "",
        make_model: "",
        status: "In Service",
        work_description: "",
        chassis_number: "",
    });
    setImages({ front: null, back: null, chassis: null });
    setImageUrls({ front: null, back: null, chassis: null });
    setRegistrationError("");
    setUploadStatus("");
  };

  const fetchNextCarId = async () => {
    const year = new Date().getFullYear();
    const prefix = `SGV-${year}-`;
    const { count, error } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
      .ilike("car_id", `${prefix}%`);

    if (error) throw error;

    const carId = createVehicleId((count || 0) + 1, new Date());
    setNextCarId(carId);
    return carId;
  };

  const fetchVehicleProfile = async (carRef: string) => {
    setLoading(true);
    try {
        // Safe check for UUID to avoid Postgres type errors
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(carRef);
        
        const query = supabase
            .from('vehicles')
            .select('*, profiles(username)');
        
        if (isUUID) {
            query.or(`id.eq.${carRef},car_id.eq.${carRef}`);
        } else {
            query.eq('car_id', carRef);
        }

        const { data, error } = await query.maybeSingle();
        
        if (!error && data) {
            setCurrentVehicle(data as VehicleWithProfile);
            setNoteDraft("");
            const { data: invoicesData, error: invoicesError } = await supabase
              .from("invoices")
              .select("id, invoice_number, created_at, payment_mode, grand_total, labour, items")
              .eq("vehicle_id", data.id)
              .order("created_at", { ascending: false });

            if (!invoicesError) {
              setVehicleInvoices((invoicesData || []) as VehicleInvoiceRecord[]);
            } else {
              setVehicleInvoices([]);
            }
            setViewMode('profile');
        } else {
            toast.error("Vehicle Profile Not Found");
            router.push('/vehicles');
        }
    } catch (err) {
        toast.error("Lookup failed");
    } finally {
        setLoading(false);
    }
  };

  const fetchVehicleForEdit = async (id: string) => {
    const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .single();
    
    if (!error && data) {
        const parsedVehicle = parseStoredMakeModel(data.make_model);
        setFormData({
            owner_name: data.owner_name,
            phone_number: data.phone_number,
            owner_address: "",
            vehicle_reg: data.vehicle_reg.replace(/\s+/g, "").toUpperCase(),
            entry_date: data.entry_date,
            vehicle_type: "",
            vehicle_make: parsedVehicle.make,
            vehicle_model: parsedVehicle.model,
            vehicle_year: "",
            vehicle_color: "",
            entry_note: data.work_description || "",
            make_model: data.make_model || "",
            status: data.status,
            work_description: data.work_description || "",
            chassis_number: data.chassis_number || "",
        });
        setImageUrls({
          front: data.front_image_url || null,
          back: data.back_image_url || null,
          chassis: data.chassis_image_url || null,
        });
        setRegistrationError("");
    }
  };

  useEffect(() => {
    const normalizedReg = formData.vehicle_reg.replace(/\s+/g, "").toUpperCase();

    if (viewMode !== "new" || !normalizedReg) {
      setRegistrationError("");
      return;
    }

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, car_id")
        .eq("vehicle_reg", normalizedReg)
        .neq("id", editingId || "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      if (error) {
        setRegistrationError("");
        return;
      }

      if (data) {
        setRegistrationError(`This vehicle is already registered as ${data.car_id}`);
        return;
      }

      setRegistrationError("");
    }, 300);

    return () => window.clearTimeout(timer);
  }, [editingId, formData.vehicle_reg, viewMode]);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, profiles(username)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvoice = async (carId?: string) => {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `SRV/${month}/${year}/`;

    const { count, error } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .ilike("invoice_number", `${prefix}%`);

    if (error) {
      toast.error("Failed to prepare invoice number");
      return;
    }

    const invoiceNo = createInvoiceNumber((count || 0) + 1, now);
    const href = carId
      ? `/billing/${invoiceNo}?car_id=${carId}`
      : `/billing/${invoiceNo}`;

    router.push(href);
  };

  const handleCreateQuotation = async (carId?: string) => {
    const now = new Date();
    const month = now.toLocaleString("en", { month: "short" }).toUpperCase();
    const year = now.getFullYear();
    const prefix = `QTN/${month}/${year}/`;

    const { count, error } = await supabase
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .ilike("quotation_number", `${prefix}%`);

    if (error) {
      toast.error("Failed to prepare quotation number");
      return;
    }

    const quotationNo = createQuotationNumber((count || 0) + 1, now);
    const href = carId
      ? `/quotations/${quotationNo}?car_id=${carId}`
      : `/quotations/${quotationNo}`;

    router.push(href);
  };

  const handleImageChange = (key: 'front' | 'back' | 'chassis', e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImages(prev => ({ ...prev, [key]: e.target.files![0] }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.owner_name ||
      !formData.phone_number ||
      !formData.vehicle_reg ||
      !formData.vehicle_make ||
      !formData.vehicle_model
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setSubmitting(true);
      setUploadStatus("");
      const cleanReg = formData.vehicle_reg.replace(/\s/g, "").toUpperCase();

      if (registrationError) {
        toast.error(registrationError);
        setSubmitting(false);
        return;
      }

      const { data: existing } = await supabase
        .from('vehicles')
        .select('id, car_id')
        .eq('vehicle_reg', cleanReg)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (existing) {
        const duplicateMessage = `This vehicle is already registered as ${existing.car_id}`;
        setRegistrationError(duplicateMessage);
        toast.error(duplicateMessage);
        setSubmitting(false);
        return;
      }

      let front_url = "";
      let back_url = "";
      let chassis_url = "";
      const uploads = [
        { key: "front", file: images.front, folder: "vehicles/front" },
        { key: "back", file: images.back, folder: "vehicles/back" },
        { key: "chassis", file: images.chassis, folder: "vehicles/chassis" },
      ].filter(
        (item): item is { key: "front" | "back" | "chassis"; file: File; folder: string } =>
          Boolean(item.file),
      );

      for (let index = 0; index < uploads.length; index++) {
        const upload = uploads[index];
        setUploadStatus(`Uploading image ${index + 1} of ${uploads.length}...`);
        const uploadedUrl = await uploadToCloudinary(upload.file, {
          kind: "vehicle",
          folder: "siragirvel/vehicles",
        });

        if (upload.key === "front") front_url = uploadedUrl;
        if (upload.key === "back") back_url = uploadedUrl;
        if (upload.key === "chassis") chassis_url = uploadedUrl;
      }

      setUploadStatus(editingId ? "Updating vehicle record..." : "Saving vehicle record...");

      const makeModel = [formData.vehicle_make, formData.vehicle_model]
        .filter(Boolean)
        .join(" ")
        .trim();
      const noteParts = [
        formData.entry_note ? `Entry note: ${formData.entry_note}` : "",
        formData.owner_address ? `Address: ${formData.owner_address}` : "",
        formData.vehicle_year ? `Year: ${formData.vehicle_year}` : "",
        formData.vehicle_color ? `Colour: ${formData.vehicle_color}` : "",
      ].filter(Boolean);
      const vehiclePayload = {
        owner_name: formData.owner_name,
        phone_number: formData.phone_number,
        alternate_phone: null,
        vehicle_reg: cleanReg,
        entry_date: formData.entry_date,
        make_model: makeModel,
        status: formData.status,
        work_description: noteParts.join(" | "),
        chassis_number: formData.chassis_number || null,
      };

      if (editingId) {
          const updateData: any = { ...vehiclePayload };
          if (front_url) updateData.front_image_url = front_url;
          if (back_url) updateData.back_image_url = back_url;
          if (chassis_url) updateData.chassis_image_url = chassis_url;

          const { error } = await supabase.from('vehicles').update(updateData).eq('id', editingId);
          if (error) throw error;
          await logActivity({
            action: "edit",
            entityType: "vehicle",
            entityId: editingId,
            entityLabel: makeModel || cleanReg,
            description: "Edited vehicle record",
            metadata: { car_id: vehicles.find((vehicle) => vehicle.id === editingId)?.car_id || null, vehicle_reg: cleanReg },
          });
          toast.success("Vehicle updated!");
      } else {
          const { data: { user } } = await supabase.auth.getUser();
          const carId = await fetchNextCarId();
          const { error } = await supabase.from('vehicles').insert([{
            car_id: carId,
            ...vehiclePayload,
            front_image_url: front_url,
            back_image_url: back_url,
            chassis_image_url: chassis_url,
            created_by: user?.id
          }]);
          if (error) throw error;
          await logActivity({
            action: "create",
            entityType: "vehicle",
            entityId: carId,
            entityLabel: formData.owner_name,
            description: "Created vehicle record",
            metadata: { car_id: carId, vehicle_reg: cleanReg },
          });
          toast.success(`Registered successfully: ${carId}`);
      }

      await fetchVehicles();
      await fetchNextCarId();
      router.push('/vehicles');
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to process");
    } finally {
      setSubmitting(false);
      setUploadStatus("");
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      const vehicle = vehicles.find((item) => item.id === deletingId) || currentVehicle;
      const { error } = await supabase.from('vehicles').delete().eq('id', deletingId);
      if (error) throw error;
      if (vehicle) {
        await logActivity({
          action: "delete",
          entityType: "vehicle",
          entityId: vehicle.id,
          entityLabel: vehicle.owner_name,
          description: "Deleted vehicle record",
          metadata: { car_id: vehicle.car_id, vehicle_reg: vehicle.vehicle_reg },
        });
      }
      toast.success("Record deleted");
      fetchVehicles();
      router.push('/vehicles');
    } catch (err) {
      toast.error("Operation failed");
    } finally {
      setDeletingId(null);
      setCurrentVehicle(null);
    }
  };

  const handleAddNote = async () => {
    if (!currentVehicle) return;
    const value = noteDraft.trim();
    if (!value) return;

    setSavingNote(true);
    try {
      const existing = currentVehicle.work_description?.trim();
      const nextDescription = existing
        ? `${existing} | Note: ${value}`
        : `Note: ${value}`;

      const { error } = await supabase
        .from("vehicles")
        .update({ work_description: nextDescription })
        .eq("id", currentVehicle.id);

      if (error) throw error;

      setCurrentVehicle((current) =>
        current ? { ...current, work_description: nextDescription } : current,
      );
      setNoteDraft("");
      toast.success("Note added");
    } catch (error) {
      toast.error("Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          invoice_number,
          created_at,
          payment_mode,
          grand_total,
          total_spare,
          total_labour,
          items,
          labour,
          vehicles (
            owner_name,
            phone_number,
            car_id,
            vehicle_reg,
            make_model,
            entry_date
          )
        `)
        .eq("id", invoiceId)
        .maybeSingle();

      if (error || !data) {
        throw error || new Error("Invoice not found");
      }

      const totalSpare = Number(data.total_spare || 0);
      const totalLabour = Number(data.total_labour || 0);
      const subtotalBeforeTax = totalSpare + totalLabour;
      const totalTax = Math.round(Number(data.grand_total || 0) - subtotalBeforeTax);
      const invoiceVehicle = Array.isArray(data.vehicles)
        ? data.vehicles[0] || {}
        : data.vehicles || {};

      generateInvoicePDF({
        invoice_number: data.invoice_number,
        vehicle: invoiceVehicle,
        items: data.items || [],
        labour: data.labour || [],
        grand_total: Number(data.grand_total || 0),
        payment_mode: data.payment_mode,
        date: data.created_at,
        total_spare: totalSpare,
        total_labour: totalLabour,
        subtotal_before_tax: subtotalBeforeTax,
        total_tax: totalTax,
      });
    } catch (error) {
      toast.error("Failed to download invoice");
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    const qClean = searchQuery.replace(/\s/g, "").toLowerCase();
    const regClean = v.vehicle_reg.replace(/\s/g, "").toLowerCase();
    const matchesSearch = v.car_id.toLowerCase().includes(qClean) || 
                         v.owner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         regClean.includes(qClean);
    return matchesSearch;
  });

  if (loading && viewMode !== 'list') {
      return (
          <div className="flex flex-col items-center justify-center p-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">Loading Hub...</p>
          </div>
      );
  }

  return (
    <div
      className={viewMode === "new" ? "spare-scope page" : ""}
      style={viewMode === "new" ? { margin: "0 auto", padding: "40px" } : undefined}
    >
      {viewMode === 'list' && (
        <div className="min-h-screen bg-[#f4f6fb] p-5 font-sans text-slate-900">
          <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.07)] overflow-hidden animate-in fade-in duration-500">
            <div className="px-8 py-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
                <p className="mt-1 text-sm text-slate-500">Manage registered vehicle records and customer assets.</p>
              </div>
              <button
                onClick={() => router.push('/vehicles/add-new')}
                className="px-5 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Register Vehicle
              </button>
            </div>

            <div className="px-8 border-b border-slate-100 py-6 flex items-center justify-between bg-zinc-50/20">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest italic">Vehicle Records</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Showing all registered workshop vehicles</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4f46e5] transition-colors" />
                  <input
                    type="text"
                    placeholder="Search ID, name or reg..."
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-lg text-sm font-medium focus:ring-4 ring-indigo-500/5 focus:border-indigo-500 outline-none w-72 transition-all shadow-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="px-8 pt-6">
              <div className="border border-slate-100 rounded-[24px] overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicle ID</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Entry Date</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicle</th>
                      <th className="px-6 py-4 text-right pr-10 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-24">
                          <LoadingSpinner label="Retrieving vehicle archive" />
                        </td>
                      </tr>
                    ) : filteredVehicles.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => router.push(`/vehicles/${v.car_id}`)}
                        className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-9 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                              {v.front_image_url ? (
                                <img src={v.front_image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Car className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-900 leading-tight">{v.owner_name}</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {v.vehicle_reg} · By {(v as any).profiles?.username || "Admin"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-[12px] text-indigo-600 tracking-tight">{v.car_id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-500 text-[11px]">{v.phone_number}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] font-bold text-slate-600">
                            {format(new Date(v.entry_date), "dd MMM, yyyy")}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] font-bold text-slate-500 truncate max-w-[140px]">
                            {v.make_model || "Vehicle record"}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right pr-10">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/vehicles/${v.car_id}`);
                              }}
                              className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-300 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                              title="View vehicle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateInvoice(v.car_id);
                              }}
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Create invoice"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateQuotation(v.car_id);
                              }}
                              className="p-1.5 hover:bg-violet-50 rounded-lg text-slate-300 hover:text-violet-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Create quotation"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/vehicles/edit/${v.id}`);
                              }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Edit vehicle"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(v.id);
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                              title="Delete vehicle"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!loading && filteredVehicles.length === 0 && (
                  <div className="py-20 text-center bg-white">
                    <div className="inline-flex w-16 h-16 bg-slate-50 rounded-full items-center justify-center mb-4">
                      <Car className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="font-bold text-slate-800">No vehicle records found</p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                      }}
                      className="mt-2 text-blue-500 font-bold text-sm hover:underline"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'profile' && currentVehicle && (
        <VehicleProfileView
          vehicle={currentVehicle}
          invoices={vehicleInvoices}
          noteDraft={noteDraft}
          savingNote={savingNote}
          onNoteDraftChange={setNoteDraft}
          onAddNote={handleAddNote}
          onBack={() => {
            setViewMode('list');
            router.push('/vehicles');
          }}
          onEdit={() => router.push(`/vehicles/edit/${currentVehicle.id}`)}
          onCreateInvoice={() => handleCreateInvoice(currentVehicle.car_id)}
          onCreateQuotation={() => handleCreateQuotation(currentVehicle.car_id)}
          onOpenInvoice={(invoiceId) => router.push(`/billing/view/${invoiceId}`)}
          onDownloadInvoice={(invoiceId) => void handleDownloadInvoice(invoiceId)}
          onViewAllInvoices={() => router.push('/billing')}
        />
      )}

      {viewMode === 'new' && (
        <VehicleRegistrationForm
          editingId={editingId}
          nextCarId={editingId ? vehicles.find((vehicle) => vehicle.id === editingId)?.car_id || "" : nextCarId || createVehicleId()}
          formData={formData}
          images={images}
          imageUrls={imageUrls}
          submitting={submitting}
          uploadStatus={uploadStatus}
          registrationError={registrationError}
          makeSuggestions={makeSuggestions}
          modelSuggestions={modelSuggestions}
          onFieldChange={(field, value) =>
            setFormData((current) => ({
              ...current,
              [field]: field === "vehicle_reg" ? value.replace(/\s+/g, "").toUpperCase() : value,
            }))
          }
          onImageChange={(key, file) =>
            {
              setImages((current) => ({ ...current, [key]: file }));
              if (file) {
                setImageUrls((current) => ({ ...current, [key]: null }));
              }
            }
          }
          onSubmit={handleSave}
          onCancel={() => router.push('/vehicles')}
        />
      )}

      {deletingId && (
        <ConfirmDeleteModal
          title="Delete Vehicle?"
          description="Delete this vehicle record permanently. This action cannot be undone."
          confirmLabel="Delete Vehicle"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

// Sub-components utilizing spare-styles.css
function StatCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105", bg, color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1.5">{label}</p>
        <p className="text-xl font-black text-slate-900 leading-none">{value}</p>
      </div>
    </div>
  );
}

function ProfileField({ icon: Icon, label, value, mono }: any) {
  return (
    <div className="flex items-center gap-4 group">
        <div className="w-9 h-9 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-400 border border-border group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all">
            <Icon className="w-4 h-4" />
        </div>
        <div>
            <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest leading-none mb-1">{label}</p>
            <p className={cn("text-[13px] font-bold text-slate-800", mono && "font-mono")}>{value}</p>
        </div>
    </div>
  );
}

function TimelineItem({ date, title, desc, icon: Icon, iconColor, isLast }: any) {
  return (
    <div className="flex gap-6 group relative">
        <div className="w-6 h-6 rounded-full bg-white border-2 border-zinc-100 flex items-center justify-center z-10 shadow-sm relative group-hover:border-indigo-500 transition-all">
            <Icon className={cn("w-3 h-3", iconColor)} />
        </div>
        <div>
            <p className="order-date mb-1">{format(new Date(date), "MMM dd, yyyy")}</p>
            <h4 className="text-[14px] font-bold text-slate-900 mb-1">{title}</h4>
            <p className="text-[12px] text-zinc-400 leading-relaxed font-medium italic">{desc}</p>
        </div>
    </div>
  );
}

function MediaUpload({ label, desc, file, onChange }: any) {
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => {
      if (file) {
          const url = URL.createObjectURL(file);
          setPrev(url);
          return () => URL.revokeObjectURL(url);
      } else setPrev(null);
  }, [file]);

  return (
    <label className="relative flex-1 group">
        <input type="file" className="hidden" onChange={onChange} />
        <div className={cn(
          "aspect-[4/3] rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden",
          prev ? "border-indigo-500 bg-white" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300"
        )}>
          {prev ? (
              <img src={prev} alt="Upload" className="w-full h-full object-cover" />
          ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Camera className="w-6 h-6 text-zinc-400" />
                </div>
                <div className="text-[11px] font-black uppercase text-slate-800 tracking-wider text-center">{label}</div>
                <div className="text-[10px] font-medium text-zinc-400 mt-1">{desc}</div>
              </>
          )}
        </div>
        {prev && (
          <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow-sm flex items-center justify-center text-indigo-600">
             <CheckCircle2 className="w-5 h-5" />
          </div>
        )}
    </label>
  );
}

export default function VehiclesPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        }>
            <VehiclesContent />
        </Suspense>
    );
}
