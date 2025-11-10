"use client";

import {
    Footer,
    FooterBrand,
    FooterCopyright,
    FooterDivider,
    FooterIcon,
    FooterLink,
    FooterLinkGroup,
    FooterTitle,
} from "flowbite-react";
import { BsDribbble, BsFacebook, BsGithub, BsInstagram, BsTwitter } from "react-icons/bs";

export default function LinnevikFooter() {
    return (
        <Footer container>
            <div className="w-full">
                <div className="grid w-full justify-between sm:flex sm:justify-between md:flex md:grid-cols-1">
                    <div>
                        <FooterBrand
                            href="/"
                            src="/logo.svg"
                            alt="Linnevik"
                            name="Linnevik"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-8 sm:mt-4 sm:grid-cols-3 sm:gap-6">
                        <div>
                            <FooterTitle title="Om oss" />
                            <FooterLinkGroup col>
                                <FooterLink href="/about">Bolaget</FooterLink>
                                <FooterLink href="/contact">Kontakt</FooterLink>
                            </FooterLinkGroup>
                        </div>
                        <div>
                            <FooterTitle title="Produkter" />
                            <FooterLinkGroup col>
                                <FooterLink href="/collections/kuddar">Kuddar</FooterLink>
                                <FooterLink href="/collections/madrassskydd">Madrassskydd</FooterLink>
                            </FooterLinkGroup>
                        </div>
                        <div>
                            <FooterTitle title="Juridik" />
                            <FooterLinkGroup col>
                                <FooterLink href="/privacy">Integritet</FooterLink>
                                <FooterLink href="/terms">Villkor</FooterLink>
                            </FooterLinkGroup>
                        </div>
                    </div>
                </div>

                {/* Ta bort Divider om du inte vill ha linje */}
                {/* <FooterDivider /> */}

                <div className="w-full sm:flex sm:items-center sm:justify-between">
                    <FooterCopyright href="/" by="Linnevik" year={new Date().getFullYear()} />
                    <div className="mt-4 flex space-x-6 sm:mt-0 sm:justify-center">
                        <FooterIcon href="https://facebook.com" icon={BsFacebook} />
                        <FooterIcon href="https://instagram.com" icon={BsInstagram} />
                        <FooterIcon href="https://twitter.com" icon={BsTwitter} />
                        <FooterIcon href="https://github.com" icon={BsGithub} />
                        <FooterIcon href="https://dribbble.com" icon={BsDribbble} />
                    </div>
                </div>
            </div>
        </Footer>
    );
}