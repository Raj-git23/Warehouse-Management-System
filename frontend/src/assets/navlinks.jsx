import { Upload, Package, BarChart4, Home, ScanText } from "lucide-react";

const NavLinks = [{
    path: "/upload",
    name: "Upload",
    icon: Upload,
    exact: true
}, {
    path: "/verify",
    name: "Verify Product",
    icon: ScanText,
    exact: true
}, {
    path: "/reports",
    name: "Verification Reports",
    icon: BarChart4,
    exact: true
}]

export default NavLinks;