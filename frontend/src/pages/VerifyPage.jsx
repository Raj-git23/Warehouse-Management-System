import React, { useState, useEffect, useRef } from "react";
import { Heading, Text, Card, Box } from "@radix-ui/themes";
import { Scan, User, ClipboardList, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import useCamera from "../hooks/useCamera";
import CameraCapture from "../components/CameraCapture";
import ProductCard from "../components/ProductCard";
import ErrorMessage from "../components/ErrorMessage";
import { verifyProduct } from "../services/api";

export const VerifyPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verifiedProduct, setVerifiedProduct] = useState(null);
  const [lastWid, setLastWid] = useState("");

  const camera = useCamera();
  const widInputRef = useRef(null);

  // Initialize form controls
  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      wid: "",
      checked_by: localStorage.getItem("checked_by") || "",
      notes: "",
    },
  });

  const checkedByValue = watch("checked_by");

  // Focus WID field on page mount
  useEffect(() => {
    if (widInputRef.current) {
      widInputRef.current.focus();
    }
  }, []);

  // Sync operator name with localStorage
  useEffect(() => {
    if (checkedByValue) {
      localStorage.setItem("checked_by", checkedByValue);
    }
  }, [checkedByValue]);

  const handleVerifySubmit = async (data) => {
    setError("");
    setSuccess(false);
    setVerifiedProduct(null);
    setLoading(true);

    try {
      const payload = {
        wid: data.wid.trim(),
        checkedBy: data.checked_by.trim(),
        notes: data.notes.trim(),
        photo: camera.photoFile,
      };

      if (!payload.wid) {
        throw new Error("Warehouse ID (WID) is required.");
      }
      if (!payload.checkedBy) {
        throw new Error("Operator Name is required.");
      }

      // API post verify log
      const result = await verifyProduct(payload);

      setVerifiedProduct(result.product);
      setLastWid(payload.wid);
      setSuccess(true);

      // Clear input fields but preserve checked_by operator
      reset({
        wid: "",
        checked_by: payload.checkedBy,
        notes: "",
      });

      // Clear local photo cache
      camera.resetCameraState();

      // Refocus WID input
      setTimeout(() => {
        if (widInputRef.current) {
          widInputRef.current.focus();
        }
      }, 100);

    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.detail || err.message || "Verification failed.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`mx-auto space-y-6 ${success && verifiedProduct ? "max-w-5xl" : "max-w-xl"}`}>
      {/* Page Header */}
      <Box className="space-y-1 text-center lg:text-left">
        <Heading size="6" className="text-slate-800 font-bold tracking-tight">
          Product Verification
        </Heading>
        <Text size="2" color="gray" className="font-medium text-slate-500">
          Scan a WID barcode, capture the product label, and confirm its details.
        </Text>
      </Box>

      {/* Grid Container for Form and Result */}
      <div className={`grid grid-cols-1 ${success && verifiedProduct ? "md:grid-cols-2" : ""} gap-6 items-start`}>

        {/* Main Submission Form */}
        <form onSubmit={handleSubmit(handleVerifySubmit)} className="space-y-6 order-2 md:order-1">

          {/* CARD 1: Operator Metadata & WID Barcode scanner */}
          <Card size="3" className="shadow-sm border border-slate-100 rounded-xl bg-white p-5">
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Scan or Enter WID</h3>
                <p className="text-xs text-slate-400 mt-0.5">Input the unique warehouse ID found on the item.</p>
              </div>

              {/* Operator Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Operator Name
                </label>
                <input
                  type="text"
                  placeholder="Enter operator name/ID"
                  {...register("checked_by", { required: true })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-semibold text-slate-700 placeholder:text-slate-400"
                />
              </div>

              {/* WID Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                  Warehouse ID (WID)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Scan className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Scan or type WID..."
                    {...register("wid", { required: true })}
                    ref={(e) => {
                      register("wid").ref(e);
                      widInputRef.current = e;
                    }}
                    className="w-full pl-10 pr-4 py-3 text-sm font-mono font-bold tracking-wide border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 shadow-inner placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Operator notes field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-slate-400" />
                  Notes (Optional)
                </label>
                <textarea
                  placeholder="Add warehouse log comments..."
                  rows={2}
                  {...register("notes")}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 font-medium text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>
          </Card>

          {/* CARD 2: Capture Label photo zone matching screenshot */}
          <Card size="3" className="shadow-sm border border-slate-100 rounded-xl bg-white p-5">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Capture Label Photo</h3>
                <p className="text-xs text-slate-400 mt-0.5">Take a picture of the physical product label for the audit log.</p>
              </div>

              <CameraCapture camera={camera} />
            </div>
          </Card>

          {/* Verify Action submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-lg text-sm font-bold tracking-wider transition-all border border-blue-600 bg-blue-600 hover:bg-blue-750 text-white cursor-pointer shadow-md select-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
              </>
            ) : (
              <>
                Verify Product <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Success notification & result card */}
        {success && verifiedProduct && (
          <div className="space-y-4 animate-fade-in order-1 md:order-2 w-full max-w-md mx-auto">
            {/* <Card className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3 text-emerald-800 shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold">Verification Logged Successfully</h4>
                <p className="text-[11px] mt-0.5 text-emerald-700 leading-relaxed font-semibold">
                  WID {lastWid} was verified and saved.
                </p>
              </div>
            </Card> */}

            <div className="flex justify-center w-full">
              <ProductCard product={verifiedProduct} wid={lastWid} />
            </div>
          </div>
        )}
      </div>

      {/* Error Alert Display */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
};

export default VerifyPage;
