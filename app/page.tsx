'use client'

// Main Dashboard Component for Personal Health Tracker
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { logGlucoseReading, getCombinationReport, logBloodPressureReading, getBloodPressureReport } from './actions';
import { getProfile } from './profile/actions';
import { supabase } from '../lib/supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTheme } from 'next-themes';
import { Sun, Moon, LogOut, FileText } from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'glucose'|'bp'>('glucose');

  // Glucose Data
  const [readings, setReadings] = useState<any[]>([]);
  const [filterMeal, setFilterMeal] = useState('');
  const [filterTag, setFilterTag] = useState('');
  
  // BP Data
  const [bpReadings, setBpReadings] = useState<any[]>([]);
  const [bpFilterTag, setBpFilterTag] = useState('');

  // Date Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  // Theme
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        if (session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
          setIsAdmin(true);
        }
      } else {
        router.push('/login');
      }
    });
  }, [router]);

  useEffect(() => {
    if (token) {
      refreshReport(token);
    }
  }, [token, filterMeal, filterTag, bpFilterTag, fromDate, toDate]); 

  useEffect(() => {
    if (token) {
      loadProfile(token);
    }
  }, [token]);

  async function loadProfile(currentToken: string) {
    try {
      const data = await getProfile(currentToken);
      setProfile(data);
    } catch (e) {
      console.log('Profile not found yet');
    }
  }

  async function refreshReport(currentToken = token) {
    if (!currentToken) return;
    try {
      const gData = await getCombinationReport(currentToken, filterMeal || undefined, filterTag || undefined, fromDate || undefined, toDate || undefined, Date.now());
      setReadings(gData);

      const bData = await getBloodPressureReport(currentToken, bpFilterTag || undefined, fromDate || undefined, toDate || undefined, Date.now());
      setBpReadings(bData);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  const handleGlucoseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMsg('');
    try {
      const formData = new FormData(e.currentTarget);
      await logGlucoseReading(formData, token);
      setMsg('Glucose Reading logged successfully!');
      e.currentTarget.reset();
      await refreshReport();
    } catch (err: any) {
      setMsg(err.message);
    }
    setIsSubmitting(false);
  };

  const handleBpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMsg('');
    try {
      const formData = new FormData(e.currentTarget);
      await logBloodPressureReading(formData, token);
      setMsg('Blood Pressure logged successfully!');
      e.currentTarget.reset();
      await refreshReport();
    } catch (err: any) {
      setMsg(err.message);
    }
    setIsSubmitting(false);
  };

  async function downloadPDF() {
    if (!token) return;
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      let yPos = 15;
      
      // Add Header Logo
      const logoUrl = '/favicon-light.png';
      const getBase64Image = (imgUrl: string) => {
        return new Promise<string>((resolve, reject) => {
          var img = new Image();
          img.onload = () => {
            var canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext("2d");
            if (ctx) ctx.drawImage(img, 0, 0, img.width, img.height);
            var dataURL = canvas.toDataURL("image/png");
            resolve(dataURL);
          };
          img.onerror = reject;
          img.src = imgUrl;
        });
      };
      
      try {
        const base64Logo = await getBase64Image(logoUrl);
        doc.addImage(base64Logo, 'PNG', 14, yPos, 15, 15);
      } catch (e) {
        console.warn('Could not load logo');
      }
      
      // Title
      doc.setFontSize(22);
      doc.setTextColor(30);
      doc.text('Medical Health Report', 35, yPos + 10);
      
      yPos += 22;
      
      // Draw Line
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, 196, yPos);
      yPos += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, yPos);
      yPos += 8;
      
      if (profile && profile.name) {
        doc.setFillColor(245, 247, 250);
        doc.rect(14, yPos, 182, 35, 'F');
        
        doc.setTextColor(40);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Patient Information`, 18, yPos + 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`Name: ${profile.name}`, 18, yPos + 16);
        if (profile.age) { doc.text(`Age: ${profile.age}`, 80, yPos + 16); }
        if (profile.blood_group) { doc.text(`Blood Group: ${profile.blood_group}`, 18, yPos + 24); }
        if (profile.diabetes_type) { doc.text(`Condition: ${profile.diabetes_type.replace('_', ' ')}`, 80, yPos + 24); }
        yPos += 42;
      } else {
        yPos += 5;
      }

      let filtersText = `Filters Applied:`;
      if (fromDate || toDate) filtersText += ` Range: ${fromDate || 'Start'} to ${toDate || 'End'} |`;
      if (filterMeal) filtersText += ` Meal: ${filterMeal} |`;
      if (filterTag || bpFilterTag) filtersText += ` Context: ${filterTag || bpFilterTag}`;
      
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(filtersText, 14, yPos);
      yPos += 6;

      // GLUCOSE TABLE
      if (readings.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(40);
        doc.setFont('helvetica', 'bold');
        doc.text('Blood Glucose History', 14, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        
        const glucoseTableData = readings.map((r: any) => [
          new Date(r.recorded_at).toLocaleString(),
          `${r.glucose_level} mg/dL`,
          `${r.meal_reference || 'N/A'}`,
          r.context_tag || 'none',
          r.notes || 'none'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Date/Time', 'Level', 'Meal', 'Context', 'Notes']],
          body: glucoseTableData,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 9 },
          didDrawPage: function(data) {
             yPos = data.cursor ? data.cursor.y : yPos;
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // BP TABLE
      if (bpReadings.length > 0) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(14);
        doc.setTextColor(40);
        doc.setFont('helvetica', 'bold');
        doc.text('Blood Pressure History', 14, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 4;
        
        const bpTableData = bpReadings.map((r: any) => [
          new Date(r.recorded_at).toLocaleString(),
          `${r.systolic} / ${r.diastolic} mmHg`,
          `${r.pulse} BPM`,
          r.context_tag || 'none',
          r.notes || 'none'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Date/Time', 'BP (Sys/Dia)', 'Pulse', 'Context', 'Notes']],
          body: bpTableData,
          theme: 'grid',
          headStyles: { fillColor: [239, 68, 68] }, 
          styles: { fontSize: 9 }
        });
      }

      // Add Page Footers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${pageCount}  |  Generated securely by Personal Health Tracker`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 14,
          { align: 'center' }
        );
        doc.text(
          `© 2026 Personal Health Tracker. Developed by Usama Saifullah.`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 9,
          { align: 'center' }
        );
      }

      doc.save('Comprehensive_Health_Report.pdf');
    } catch (err: any) {
      setMsg("Failed to generate PDF: " + err.message);
    }
    setIsGenerating(false);
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!token) return <div className="p-8 text-center dark:text-white">Loading Secure Dashboard...</div>;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 md:p-8 font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-inner">
              P
            </div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100">Personal Health Tracker</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => router.push('/admin')}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              >
                Admin Panel
              </button>
            )}
            <button
              onClick={() => router.push('/about')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
            >
              About
            </button>
            <button
              onClick={() => router.push('/profile')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              My Profile
            </button>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
            >
              <LogOut size={16} /> Sign Out
            </button>
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-1.5 rounded-md bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors ml-2"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className="p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors">
            {msg}
          </div>
        )}

        {/* HEALTH TOGGLE TABS */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-200 dark:bg-slate-800 p-1 rounded-xl inline-flex shadow-inner">
            <button
              onClick={() => setActiveTab('glucose')}
              className={`px-8 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'glucose' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🩸 Blood Glucose
            </button>
            <button
              onClick={() => setActiveTab('bp')}
              className={`px-8 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'bp' 
                  ? 'bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🫀 Blood Pressure
            </button>
          </div>
        </div>

        {/* GLUCOSE TAB */}
        {activeTab === 'glucose' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                  Log Glucose
                </h2>
                <form onSubmit={handleGlucoseSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Glucose Level (mg/dL)</label>
                    <input type="number" name="glucose_level" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors" placeholder="e.g. 105" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Context Tag</label>
                    <select name="context_tag" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors">
                      <option value="fasting (breakfast)">Fasting (Breakfast)</option>
                      <option value="pre-meal (lunch)">Pre-Meal (Lunch)</option>
                      <option value="pre-meal (dinner)">Pre-Meal (Dinner)</option>
                      <option value="post-meal">Post-Meal (2 hrs)</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Meal Reference (Optional)</label>
                    <select name="meal_reference" className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors">
                      <option value="">None</option>
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                      <option value="snack">Snack</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Hours Since Meal (Optional)</label>
                    <input type="number" step="0.5" name="hours_offset" className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors" placeholder="e.g. 2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Notes (Optional)</label>
                    <textarea name="notes" rows={2} className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-blue-500 outline-none transition-colors" placeholder="Any dietary or stress context..."></textarea>
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save Glucose Reading'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors h-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                    Glucose History
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                     <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Date Range Filter</label>
                     <div className="flex items-center gap-2">
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <span className="text-gray-400">to</span>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none" />
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Meal Filter</label>
                      <select value={filterMeal} onChange={(e) => setFilterMeal(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">All Meals</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="snack">Snack</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Context Filter</label>
                      <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">All Contexts</option>
                        <option value="fasting (breakfast)">Fasting</option>
                        <option value="pre-meal">Pre-Meal (All)</option>
                        <option value="post-meal">Post-Meal (All)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-600 dark:text-slate-300 uppercase bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date/Time</th>
                        <th className="px-4 py-3 font-semibold">Glucose</th>
                        <th className="px-4 py-3 font-semibold">Meal</th>
                        <th className="px-4 py-3 font-semibold">Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                      {readings.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">No readings found for these filters.</td></tr>
                      ) : (
                        readings.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-3 text-gray-800 dark:text-slate-200 whitespace-nowrap">{new Date(r.recorded_at).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'})}</td>
                            <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{r.glucose_level} <span className="text-xs font-normal text-gray-500">mg/dL</span></td>
                            <td className="px-4 py-3 text-gray-600 dark:text-slate-300 capitalize">{r.meal_reference || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                                {r.context_tag}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BLOOD PRESSURE TAB */}
        {activeTab === 'bp' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors">
                <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                  <span className="w-2 h-6 bg-red-500 rounded-full"></span>
                  Log Blood Pressure
                </h2>
                <form onSubmit={handleBpSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Systolic</label>
                      <input type="number" name="systolic" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-red-500 outline-none transition-colors" placeholder="120" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Diastolic</label>
                      <input type="number" name="diastolic" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-red-500 outline-none transition-colors" placeholder="80" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Pulse (BPM)</label>
                    <input type="number" name="pulse" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-red-500 outline-none transition-colors" placeholder="72" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Context Tag</label>
                    <select name="context_tag" required className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-red-500 outline-none transition-colors">
                      <option value="morning">Morning (Waking)</option>
                      <option value="evening">Evening (Bedtime)</option>
                      <option value="post-medication">Post-Medication</option>
                      <option value="feeling-unwell">Feeling Unwell</option>
                      <option value="random">Random</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Notes (Optional)</label>
                    <textarea name="notes" rows={2} className="w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white p-2.5 rounded focus:ring-2 focus:ring-red-500 outline-none transition-colors" placeholder="Resting? After coffee?"></textarea>
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-sm disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save BP Reading'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 transition-colors h-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-6 bg-orange-500 rounded-full"></span>
                    Blood Pressure History
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                     <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Date Range Filter</label>
                     <div className="flex items-center gap-2">
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-orange-500 outline-none" />
                        <span className="text-gray-400">to</span>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-orange-500 outline-none" />
                     </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Context Filter</label>
                    <select value={bpFilterTag} onChange={(e) => setBpFilterTag(e.target.value)} className="w-full text-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-200 p-2 rounded focus:ring-2 focus:ring-orange-500 outline-none">
                      <option value="">All Contexts</option>
                      <option value="morning">Morning</option>
                      <option value="evening">Evening</option>
                      <option value="post-medication">Post-Medication</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-600 dark:text-slate-300 uppercase bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date/Time</th>
                        <th className="px-4 py-3 font-semibold">Sys / Dia</th>
                        <th className="px-4 py-3 font-semibold">Pulse</th>
                        <th className="px-4 py-3 font-semibold">Context</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                      {bpReadings.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">No readings found for these filters.</td></tr>
                      ) : (
                        bpReadings.map((r) => {
                          const isHigh = r.systolic >= 130 || r.diastolic >= 80;
                          return (
                            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                              <td className="px-4 py-3 text-gray-800 dark:text-slate-200 whitespace-nowrap">{new Date(r.recorded_at).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'})}</td>
                              <td className={`px-4 py-3 font-bold ${isHigh ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {r.systolic} <span className="text-gray-400 font-normal">/</span> {r.diastolic} <span className="text-xs font-normal text-gray-500">mmHg</span>
                              </td>
                              <td className="px-4 py-3 text-gray-800 dark:text-slate-300 font-medium">{r.pulse} <span className="text-xs font-normal text-gray-500">BPM</span></td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                                  {r.context_tag}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        <div className="flex justify-center mt-6">
          <button
            onClick={downloadPDF}
            disabled={isGenerating || (readings.length === 0 && bpReadings.length === 0)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Generating...</>
            ) : (
              <><FileText size={20} /> Download Complete Medical PDF Report</>
            )}
          </button>
        </div>

      </div>
    </main>
  );
}