'use client';

import React, { useState } from 'react';

interface ParsedRow {
  Quantity: number;
  Item: string;
  price: number;
  _selected: boolean;
  everyone: boolean;
  [key: string]: number | string | boolean;
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
      // Add internal _selected property and columns for "everyone" and each name
      parsedData = parsedData.map(row => {
        const newRow = { ...row, _selected: false, everyone: false };
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
      [field]:
        field === 'Quantity' || field === 'price' ? parseFloat(value) : value,
    };
    setData(updatedData);
  };

  // Toggle checkbox values for "everyone" and individual names
  const handleCheckboxChange = (index: number, field: string) => {
    const updatedData = [...data];
    updatedData[index] = {
      ...updatedData[index],
      [field]: !updatedData[index][field],
    };
    setData(updatedData);
  };

  // Toggle row selection (internal _selected property)
  const handleRowSelect = (index: number) => {
    const updatedData = [...data];
    updatedData[index]._selected = !updatedData[index]._selected;
    setData(updatedData);
  };

  // Delete all selected rows
  const handleDeleteSelected = () => {
    const filteredData = data.filter(row => !row._selected);
    setData(filteredData);
  };

  // Add a new row to the table
  const handleAddRow = () => {
    const newRow: ParsedRow = { Quantity: 0, Item: '', price: 0, everyone: false, _selected: false };
    names.forEach(name => {
      newRow[name] = false;
    });
    setData([...data, newRow]);
  };

  // Calculate totals for the receipt
  const subtotal = data.reduce((sum, row) => sum + (row.price || 0), 0);
  const taxAmount = taxType === 'percentage' ? subtotal * (taxValue / 100) : taxValue;
  const tipAmount = tipType === 'percentage' ? (subtotal + taxAmount) * (tipValue / 100) : tipValue;
  const grandTotal = subtotal + taxAmount + tipAmount;

  // Calculate each person's subtotal based on row price distribution
  const personTotals = names.reduce((acc, name) => {
    acc[name] = 0;
    return acc;
  }, {} as { [key: string]: number });

  // Build a detailed breakdown per person
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

  // Calculate final amount owed per person (subtotal + proportional tax/tip)
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
      personBreakdown[name].items.forEach(item => {
        text += `    - ${item.item}: $${item.amount.toFixed(2)}\n`;
      });
      const taxTipShare = subtotal > 0 ? (personTotals[name] / subtotal) * (taxAmount + tipAmount) : 0;
      text += `Taxes & Tips: $${taxTipShare.toFixed(2)}\n`;
      text += `Total Cost: $${(personTotals[name] + taxTipShare).toFixed(2)}\n\n`;
    });
    return text;
  };

  // Handle download breakdown: create blob and trigger download
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

  // Count selected rows for conditional display of delete button
  const selectedCount = data.filter(row => row._selected).length;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-md rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-900 dark:text-gray-100">
          Bill Splitter
        </h1>

        {/* Names Input Section */}
        <div className="mb-6">
          <label className="block text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">
            Enter names of all people splitting (comma separated)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={namesInput}
              onChange={e => setNamesInput(e.target.value)}
              placeholder="e.g. Alice, Bob, Charlie"
              className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleNamesSubmit}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              Save Names
            </button>
          </div>
          {names.length > 0 && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              Names entered: {['everyone', ...names].join(', ')}
            </p>
          )}
        </div>

        {/* File Upload Section */}
        <div className="flex flex-col items-center mb-6">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="mb-4 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Parse Receipt'}
          </button>
        </div>

        {/* Editable Table Section */}
        {data.length > 0 && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Parsed Receipt Data
              </h2>
              {selectedCount > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                >
                  Delete Selected ({selectedCount})
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 dark:border-gray-600">
                <thead className="bg-gray-200 dark:bg-gray-700">
                  <tr>
                    {/* Selection Toggle Column */}
                    <th className="px-2 py-2 border w-8"></th>
                    <th className="px-4 py-2 border w-20">Quantity</th>
                    <th className="px-4 py-2 border">Item</th>
                    <th className="px-4 py-2 border w-20">Price</th>
                    <th className="px-4 py-2 border w-24">Everyone</th>
                    {names.map((name, idx) => (
                      <th key={idx} className="px-4 py-2 border w-24">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                      {/* Selection toggle cell */}
                      <td className="px-2 py-2 border w-8 text-center">
                        <input
                          type="checkbox"
                          checked={row._selected}
                          onChange={() => handleRowSelect(index)}
                        />
                      </td>
                      <td className="px-4 py-2 border w-20">
                        <input
                          type="number"
                          value={row.Quantity}
                          onChange={e => handleInputChange(index, 'Quantity', e.target.value)}
                          className="w-full p-1 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </td>
                      <td className="px-4 py-2 border">
                        <input
                          type="text"
                          value={row.Item}
                          onChange={e => handleInputChange(index, 'Item', e.target.value)}
                          className="w-full p-1 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </td>
                      <td className="px-4 py-2 border w-20">
                        <input
                          type="number"
                          value={row.price}
                          onChange={e => handleInputChange(index, 'price', e.target.value)}
                          className="w-full p-1 border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
            <div className="mt-4 text-right">
              <button
                onClick={handleAddRow}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
              >
                Add Row
              </button>
            </div>
          </div>
        )}

        {/* Tax & Tip Section */}
        {data.length > 0 && (
          <div className="mt-8 border-t pt-6 border-gray-300 dark:border-gray-600">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Tax & Tip
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Tax Options */}
              <div className="p-4 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                <h3 className="text-xl font-medium mb-2 text-gray-900 dark:text-gray-100">Tax</h3>
                <div className="flex items-center space-x-4 mb-2">
                  <label className="flex items-center space-x-1 text-gray-900 dark:text-gray-100">
                    <input
                      type="radio"
                      name="taxType"
                      value="percentage"
                      checked={taxType === 'percentage'}
                      onChange={() => setTaxType('percentage')}
                    />
                    <span>%</span>
                  </label>
                  <label className="flex items-center space-x-1 text-gray-900 dark:text-gray-100">
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
                  className="w-full p-2 border rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                  placeholder="Enter tax amount"
                />
              </div>
              {/* Tip Options */}
              <div className="p-4 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
                <h3 className="text-xl font-medium mb-2 text-gray-900 dark:text-gray-100">Tip</h3>
                <div className="flex items-center space-x-4 mb-2">
                  <label className="flex items-center space-x-1 text-gray-900 dark:text-gray-100">
                    <input
                      type="radio"
                      name="tipType"
                      value="percentage"
                      checked={tipType === 'percentage'}
                      onChange={() => setTipType('percentage')}
                    />
                    <span>%</span>
                  </label>
                  <label className="flex items-center space-x-1 text-gray-900 dark:text-gray-100">
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
                  className="w-full p-2 border rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                  placeholder="Enter tip amount"
                />
              </div>
            </div>
            {/* Totals Summary */}
            <div className="mt-6 p-4 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600">
              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Summary</h3>
              <p className="mb-1 text-gray-900 dark:text-gray-100">Subtotal: ${subtotal.toFixed(2)}</p>
              <p className="mb-1 text-gray-900 dark:text-gray-100">Tax: ${taxAmount.toFixed(2)}</p>
              <p className="mb-1 text-gray-900 dark:text-gray-100">Tip: ${tipAmount.toFixed(2)}</p>
              <p className="mb-1 font-bold text-gray-900 dark:text-gray-100">Grand Total: ${grandTotal.toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* How Much Everyone Owes Section */}
        {data.length > 0 && names.length > 0 && (
          <div className="mt-8 border-t pt-6 border-gray-300 dark:border-gray-600">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              How Much Everyone Owes
            </h2>
            <div className="space-y-2">
              {names.map((name, idx) => (
                <p key={idx} className="text-lg text-gray-900 dark:text-gray-100">
                  {name}: ${personOwed[name].toFixed(2)}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Download Detailed Breakdown Section */}
        {data.length > 0 && names.length > 0 && (
          <div className="mt-8 border-t pt-6 text-center border-gray-300 dark:border-gray-600">
            <button
              onClick={handleDownloadBreakdown}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
            >
              Download Detailed Breakdown
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
