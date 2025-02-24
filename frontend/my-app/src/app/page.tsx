'use client';

import React, { useState } from 'react';

interface ParsedRow {
  Quantity: number;
  Item: string;
  price: number;
  // Additional keys will be added dynamically (everyone and names)
  [key: string]: any;
}

export default function ReceiptPage() {
  // States for names, file, parsed data, and loading
  const [namesInput, setNamesInput] = useState<string>('');
  const [names, setNames] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);

  // States for Tax and Tip
  const [taxType, setTaxType] = useState<'percentage' | 'dollar'>('percentage');
  const [taxValue, setTaxValue] = useState<number>(0);
  const [tipType, setTipType] = useState<'percentage' | 'dollar'>('percentage');
  const [tipValue, setTipValue] = useState<number>(0);

  // Handle names submission: comma-separated names are split and trimmed
  const handleNamesSubmit = () => {
    const parsedNames = namesInput.split(',').map(name => name.trim()).filter(Boolean);
    setNames(parsedNames);
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  // Convert file to a base64 encoded string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove data URL prefix
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle receipt parsing
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const base64Image = await fileToBase64(file);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/parse_receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64_image: base64Image }),
      });
      if (!response.ok) {
        throw new Error('Failed to parse receipt');
      }
      const jsonData = await response.json();
      let parsedData: ParsedRow[] = jsonData.parsed_data;
      // Add an "everyone" column and a column for each name
      parsedData = parsedData.map(row => {
        const newRow = { ...row };
        newRow['everyone'] = false;
        names.forEach(name => {
          newRow[name] = false;
        });
        return newRow;
      });
      setData(parsedData);
    } catch (error) {
      console.error(error);
      setData([]);
    }
    setLoading(false);
  };

  // Update input fields in the editable table
  const handleInputChange = (index: number, field: string, value: string) => {
    const updatedData = [...data];
    updatedData[index] = {
      ...updatedData[index],
      [field]: field === 'Quantity' || field === 'price' ? parseFloat(value) : value,
    };
    setData(updatedData);
  };

  // Toggle checkbox values for "everyone" or each name
  const handleCheckboxChange = (index: number, field: string) => {
    const updatedData = [...data];
    updatedData[index] = {
      ...updatedData[index],
      [field]: !updatedData[index][field],
    };
    setData(updatedData);
  };

  // Calculate totals for the receipt
  const subtotal = data.reduce((sum, row) => sum + (row.price || 0), 0);
  const taxAmount = taxType === 'percentage' ? subtotal * (taxValue / 100) : taxValue;
  // For percentage tip, apply on (subtotal + tax)
  const tipAmount = tipType === 'percentage' ? (subtotal + taxAmount) * (tipValue / 100) : tipValue;
  const grandTotal = subtotal + taxAmount + tipAmount;

  // Calculate each person's subtotal based on row price distribution
  const personTotals = names.reduce((acc, name) => {
    acc[name] = 0;
    return acc;
  }, {} as { [key: string]: number });

  // Also build a detailed breakdown per person
  type BreakdownItem = { item: string; amount: number };
  const personBreakdown = names.reduce((acc, name) => {
    acc[name] = { items: [] as BreakdownItem[], subtotal: 0 };
    return acc;
  }, {} as { [key: string]: { items: BreakdownItem[]; subtotal: number } });

  data.forEach(row => {
    const rowPrice = row.price || 0;
    if (row.everyone) {
      const split = rowPrice / (names.length || 1);
      names.forEach(name => {
        personTotals[name] += split;
        personBreakdown[name].items.push({ item: row.Item, amount: split });
        personBreakdown[name].subtotal += split;
      });
    } else {
      const checkedNames = names.filter(name => row[name]);
      if (checkedNames.length > 0) {
        if (checkedNames.length > 1) {
          const split = rowPrice / checkedNames.length;
          checkedNames.forEach(name => {
            personTotals[name] += split;
            personBreakdown[name].items.push({ item: row.Item, amount: split });
            personBreakdown[name].subtotal += split;
          });
        } else {
          const name = checkedNames[0];
          personTotals[name] += rowPrice;
          personBreakdown[name].items.push({ item: row.Item, amount: rowPrice });
          personBreakdown[name].subtotal += rowPrice;
        }
      }
    }
  });

  // Now calculate final amount owed per person by adding their proportional share of tax and tip
  const personOwed = names.reduce((acc, name) => {
    const personSubtotal = personTotals[name];
    const extra = subtotal > 0 ? (personSubtotal / subtotal) * (taxAmount + tipAmount) : 0;
    acc[name] = personSubtotal + extra;
    return acc;
  }, {} as { [key: string]: number });

  // Generate breakdown text for download
  const generateBreakdownText = (): string => {
    let text = `Subtotal: $${subtotal.toFixed(2)}\n`;
    text += `Taxes & Tips: $${(taxAmount + tipAmount).toFixed(2)}\n`;
    text += `Grand Total: $${grandTotal.toFixed(2)}\n\n`;
    text += `Amount Each Person Owes:\n`;
    names.forEach(name => {
      text += `${name}:\n`;
      // List each item breakdown for this person
      personBreakdown[name].items.forEach(item => {
        text += `    - ${item.item}: $${item.amount.toFixed(2)}\n`;
      });
      // Calculate proportional tax & tip for this person
      const taxTipShare = subtotal > 0 ? (personTotals[name] / subtotal) * (taxAmount + tipAmount) : 0;
      text += `Taxes & Tips: $${taxTipShare.toFixed(2)}\n`;
      text += `Total Cost: $${(personTotals[name] + taxTipShare).toFixed(2)}\n\n`;
    });
    return text;
  };

  // Handle download breakdown: create a blob and trigger download
  const handleDownloadBreakdown = () => {
    const breakdownText = generateBreakdownText();
    const blob = new Blob([breakdownText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'detailed_breakdown.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6">Bill Splitter</h1>

        {/* Names Input Section */}
        <div className="mb-6">
          <label className="block text-lg font-medium mb-2">
            Enter names of all people splitting (comma separated)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={namesInput}
              onChange={e => setNamesInput(e.target.value)}
              placeholder="e.g. Alice, Bob, Charlie"
              className="flex-1 p-2 border border-gray-300 rounded-md"
            />
            <button
              onClick={handleNamesSubmit}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Save Names
            </button>
          </div>
          {names.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              Names entered: {['everyone', ...names].join(', ')}
            </p>
          )}
        </div>

        {/* File Upload Section */}
        <div className="flex flex-col items-center mb-6">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="mb-4 p-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Parse Receipt'}
          </button>
        </div>

        {/* Editable Table Section */}
        {data.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Parsed Receipt Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-2 border w-20">Quantity</th>
                    <th className="px-4 py-2 border">Item</th>
                    <th className="px-4 py-2 border w-20">Price</th>
                    <th className="px-4 py-2 border w-24">Everyone</th>
                    {names.map((name, idx) => (
                      <th key={idx} className="px-4 py-2 border w-24">{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border w-20">
                        <input
                          type="number"
                          value={row.Quantity}
                          onChange={e => handleInputChange(index, 'Quantity', e.target.value)}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                      <td className="px-4 py-2 border">
                        <input
                          type="text"
                          value={row.Item}
                          onChange={e => handleInputChange(index, 'Item', e.target.value)}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                      <td className="px-4 py-2 border w-20">
                        <input
                          type="number"
                          value={row.price}
                          onChange={e => handleInputChange(index, 'price', e.target.value)}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                      <td className="px-4 py-2 border w-24 text-center">
                        <input
                          type="checkbox"
                          checked={row.everyone}
                          onChange={() => handleCheckboxChange(index, 'everyone')}
                        />
                      </td>
                      {names.map((name, idx) => (
                        <td key={idx} className="px-4 py-2 border w-24 text-center">
                          <input
                            type="checkbox"
                            checked={row[name]}
                            onChange={() => handleCheckboxChange(index, name)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* Tax & Tip Section */}
        {data.length > 0 && (
          <div className="mt-8 border-t pt-6">
            <h2 className="text-2xl font-semibold mb-4">Tax & Tip</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Tax Options */}
              <div className="p-4 border rounded">
                <h3 className="text-xl font-medium mb-2">Tax</h3>
                <div className="flex items-center space-x-4 mb-2">
                  <label className="flex items-center space-x-1">
                    <input
                      type="radio"
                      name="taxType"
                      value="percentage"
                      checked={taxType === 'percentage'}
                      onChange={() => setTaxType('percentage')}
                    />
                    <span>%</span>
                  </label>
                  <label className="flex items-center space-x-1">
                    <input
                      type="radio"
                      name="taxType"
                      value="dollar"
                      checked={taxType === 'dollar'}
                      onChange={() => setTaxType('dollar')}
                    />
                    <span>$</span>
                  </label>
                </div>
                <input
                  type="number"
                  value={taxValue}
                  onChange={e => setTaxValue(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 border rounded"
                  placeholder="Enter tax amount"
                />
              </div>
              {/* Tip Options */}
              <div className="p-4 border rounded">
                <h3 className="text-xl font-medium mb-2">Tip</h3>
                <div className="flex items-center space-x-4 mb-2">
                  <label className="flex items-center space-x-1">
                    <input
                      type="radio"
                      name="tipType"
                      value="percentage"
                      checked={tipType === 'percentage'}
                      onChange={() => setTipType('percentage')}
                    />
                    <span>%</span>
                  </label>
                  <label className="flex items-center space-x-1">
                    <input
                      type="radio"
                      name="tipType"
                      value="dollar"
                      checked={tipType === 'dollar'}
                      onChange={() => setTipType('dollar')}
                    />
                    <span>$</span>
                  </label>
                </div>
                <input
                  type="number"
                  value={tipValue}
                  onChange={e => setTipValue(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 border rounded"
                  placeholder="Enter tip amount"
                />
              </div>
            </div>
            {/* Totals Summary */}
            <div className="mt-6 p-4 border rounded">
              <h3 className="text-xl font-bold mb-2">Summary</h3>
              <p className="mb-1">Subtotal: ${subtotal.toFixed(2)}</p>
              <p className="mb-1">Tax: ${taxAmount.toFixed(2)}</p>
              <p className="mb-1">Tip: ${tipAmount.toFixed(2)}</p>
              <p className="mb-1 font-bold">Grand Total: ${grandTotal.toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* How Much Everyone Owes Section */}
        {data.length > 0 && names.length > 0 && (
          <div className="mt-8 border-t pt-6">
            <h2 className="text-2xl font-semibold mb-4">How Much Everyone Owes</h2>
            <div className="space-y-2">
              {names.map((name, idx) => (
                <p key={idx} className="text-lg">
                  {name}: ${personOwed[name].toFixed(2)}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Download Detailed Breakdown Section */}
        {data.length > 0 && names.length > 0 && (
          <div className="mt-8 border-t pt-6 text-center">
            <button
              onClick={handleDownloadBreakdown}
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Download Detailed Breakdown
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
