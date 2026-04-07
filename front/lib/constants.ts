import {
  ShoppingCart,
  Globe,
  ArrowRightLeft,
  Building,
  CreditCard,
  Home,
  Car,
  Tv,
  Smartphone,
  Shirt,
  Heart,
  GraduationCap,
  Wallet,
  CircleDollarSign,
  Shield,
  ReceiptText,
} from "lucide-react";
import { LucideIcon } from "lucide-react";

// Interfaz para la categoría
export interface ExpenseCategory {
  value: string;
  label: string;
  icon: LucideIcon | null;
  color: string;
}

// Definición de todas las categorías disponibles en la aplicación
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: "all", label: "Todas las categorías", icon: null, color: "#64748b" },
  { value: "Alimentación", label: "Alimentación", icon: ShoppingCart, color: "#3b82f6" },
  { value: "Transporte", label: "Transporte", icon: Car, color: "#14b8a6" },
  { value: "Salud", label: "Salud", icon: Heart, color: "#ef4444" },
  { value: "Entretenimiento", label: "Entretenimiento", icon: Tv, color: "#8b5cf6" },
  { value: "Servicios básicos", label: "Servicios básicos", icon: ReceiptText, color: "#10b981" },
  { value: "Educación", label: "Educación", icon: GraduationCap, color: "#eab308" },
  { value: "Vivienda", label: "Vivienda", icon: Home, color: "#0ea5e9" },
  { value: "Vestimenta", label: "Vestimenta", icon: Shirt, color: "#d946ef" },
  { value: "Transferencia", label: "Transferencia", icon: ArrowRightLeft, color: "#ec4899" },
  { value: "Retiro de efectivo", label: "Retiro de efectivo", icon: Wallet, color: "#f97316" },
  { value: "Seguros", label: "Seguros", icon: Shield, color: "#22c55e" },
  { value: "Impuestos y tasas", label: "Impuestos y tasas", icon: Building, color: "#6366f1" },
  { value: "Ingresos", label: "Ingresos", icon: CircleDollarSign, color: "#16a34a" },
  { value: "Suscripciones", label: "Suscripciones", icon: Globe, color: "#06b6d4" },
  { value: "Tecnología", label: "Tecnología", icon: Smartphone, color: "#6b7280" },
  { value: "Otros", label: "Otros", icon: CreditCard, color: "#64748b" },
];

// Función para obtener el color de una categoría
export const getCategoryColor = (category: string): string => {
  const foundCategory = EXPENSE_CATEGORIES.find(c => c.value === category);
  return foundCategory?.color || "#64748b"; // Color por defecto
};

// Función para obtener el icono de una categoría
export const getCategoryIcon = (category: string): LucideIcon => {
  const foundCategory = EXPENSE_CATEGORIES.find(c => c.value === category);
  if (!foundCategory || !foundCategory.icon) return CreditCard;
  return foundCategory.icon;
}; 
