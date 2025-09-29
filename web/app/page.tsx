import HeroCover from "@/sections/HeroCover";
import FeaturedGrid from "@/sections/FeaturedGrid";
import ClientLogosRotating from "@/sections/ClientLogosRotating";
import CategoriesTeaser from "@/sections/CategoriesTeaser";
import SampleCTA from '@/sections/SampleCTA';
export default function Home() {
    return (
        <>
            <HeroCover />
            <div className="mt-12 w-full">
                <ClientLogosRotating />
            </div>
            <CategoriesTeaser />
            <FeaturedGrid />
            <SampleCTA />
        </>
    );
}