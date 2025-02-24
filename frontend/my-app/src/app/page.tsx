'use client';

import React, { useState } from 'react';

interface ParsedRow {
  Quantity: number;
  Item: string;
  price: number;
  // Additional keys for checkboxes will be added dynamically (everyone and names)
  [key: string]: any;
}

export default function ReceiptPage() {
  // State for names and parsed data
  const [namesInput, setNamesInput] = useState<string>(''); // comma-separated names input
  const [names, setNames] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Handle names submission - split comma-separated names and trim whitespace
  const handleNamesSubmit = () => {
    const parsedNames = namesInput.split(',').map(name => name.trim()).filter(Boolean);
    setNames(parsedNames);
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove the data URL prefix
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle receipt parsing upload
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
      // Parse the parsed receipt data and add additional columns
      let parsedData: ParsedRow[] = jsonData.parsed_data;
      // Add a default "everyone" checkbox column and a checkbox for each entered name.
      parsedData = parsedData.map(row => {
        const newRow = { ...row };
        newRow['everyone'] = false;
        // Add a checkbox field for each name provided
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

  // Handle input change for Quantity, Item, and price columns
  const handleInputChange = (index: number, field: string, value: string) => {
    const updatedData = [...data];
    updatedData[index] = {
      ...updatedData[index],
      [field]: field === 'Quantity' || field === 'price' ? parseFloat(value) : value,
    };
    setData(updatedData);
  };

  // Handle checkbox toggling for "everyone" and names columns
  const handleCheckboxChange = (index: number, field: string) => {
    const updatedData = [...data];
    updatedData[index] = {
      ...updatedData[index],
      [field]: !updatedData[index][field],
    };
    setData(updatedData);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-md rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-6">Receipt Parser</h1>

        {/* Step 1: Enter names */}
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

        {/* Step 2: Receipt File Upload */}
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

        {/* Step 3: Editable Table with Parsed Data */}
        {data.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Parsed Receipt Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-2 border">Quantity</th>
                    <th className="px-4 py-2 border">Item</th>
                    <th className="px-4 py-2 border">Price</th>
                    {/* Always include the "everyone" column */}
                    <th className="px-4 py-2 border">Everyone</th>
                    {/* Add a column for each name */}
                    {names.map((name, idx) => (
                      <th key={idx} className="px-4 py-2 border">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border">
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
                      <td className="px-4 py-2 border">
                        <input
                          type="number"
                          value={row.price}
                          onChange={e => handleInputChange(index, 'price', e.target.value)}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                      {/* "Everyone" column as a checkbox */}
                      <td className="px-4 py-2 border text-center">
                        <input
                          type="checkbox"
                          checked={row.everyone}
                          onChange={() => handleCheckboxChange(index, 'everyone')}
                        />
                      </td>
                      {/* Columns for each name as checkboxes */}
                      {names.map((name, idx) => (
                        <td key={idx} className="px-4 py-2 border text-center">
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

      </div>
    </div>
  );
}
