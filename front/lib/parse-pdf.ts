export interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: string
  category?: string
}

export async function parsePdf(): Promise<Transaction[]> {
  // In a real implementation, this would extract text from the PDF
  // and parse it into structured data

  // For demo purposes, we'll return mock data
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: "1", date: "02/01/2025", description: "MERCADITO RI", amount: 170.0, type: "COMPRA" },
        { id: "2", date: "02/01/2025", description: "PEDIDOSYA*PO", amount: 509.0, type: "COMPRA" },
        // More transactions would be parsed from the actual PDF
      ])
    }, 1500)
  })
}

export function categorizeTransactions(transactions: Transaction[]): Transaction[] {
  // This function would apply categorization rules to transactions
  // based on the description or other attributes

  const categories: Record<string, string> = {
    MERCADITO: "Alimentación",
    DEVOTO: "Alimentación",
    AUTOSERVICE: "Alimentación",
    PEDIDOSYA: "Restaurantes",
    MOJITO: "Restaurantes",
    SUSHI: "Restaurantes",
    VETERINARIA: "Mascotas",
    "ANIMAL SHOP": "Mascotas",
    VERCEL: "Servicios Digitales",
    ENVATO: "Servicios Digitales",
    PAYPAL: "Servicios Digitales",
    TRASPASO: "Transferencias",
    "D.G.I.": "Impuestos",
    "B.P.S.": "Impuestos",
  }

  return transactions.map((transaction) => {
    let category = "Otros"

    for (const [keyword, cat] of Object.entries(categories)) {
      if (transaction.description.includes(keyword)) {
        category = cat
        break
      }
    }

    return {
      ...transaction,
      category,
    }
  })
}

